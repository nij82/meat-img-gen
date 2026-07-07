import OpenAI, { toFile } from "openai";
import sharp from "sharp";
import { NextRequest, NextResponse } from "next/server";
import { buildThumbnailPrompt, normalizeGenerationMode } from "@/lib/generation-mode-guidelines";
import { createClientKeyHash } from "@/lib/server/api-key-hash";
import { decryptSecretValue } from "@/lib/server/crypto";
import { KnownServerError } from "@/lib/server/errors";
import { MissingEnvVarError } from "@/lib/server/env";
import {
  createGenerationJob,
  markGenerationJobError,
  markGenerationJobSuccess,
} from "@/lib/server/generation-jobs";
import { getEncryptedOpenAiApiKey } from "@/lib/server/user-openai-api-key";
import { requireUser } from "@/lib/supabase/server";

const MAX_IMAGES = 2;
const MAX_RESULTS = 4;
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 5;
const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const ERROR_MESSAGES = {
  unauthorized: "로그인 후 사용할 수 있습니다.",
  missingKey: "OpenAI API 키를 먼저 설정해 주세요.",
  loadFailed: "저장된 OpenAI API 키를 불러오지 못했습니다.",
  decryptFailed: "저장된 OpenAI API 키를 복호화하지 못했습니다.",
  invalidKey: "저장된 OpenAI API 키가 올바르지 않거나 권한이 없습니다.",
  missingImage: "원본 이미지를 업로드해 주세요.",
  tooManyImages: "원본 이미지는 최대 2장까지 업로드할 수 있습니다.",
  invalidType: "지원하지 않는 이미지 형식입니다.",
  tooLarge: "이미지 파일 용량이 너무 큽니다.",
  generateFailed: "썸네일 생성에 실패했습니다.",
  retry: "잠시 후 다시 시도해 주세요.",
} as const;

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

const rateLimitStore = new Map<string, RateLimitEntry>();

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const user = await requireUser();
  if (!user) {
    return errorResponse(ERROR_MESSAGES.unauthorized, 401);
  }

  const ip = getClientIp(request);
  if (isRateLimited(ip)) {
    return errorResponse(ERROR_MESSAGES.retry, 429);
  }

  try {
    const formData = await request.formData();
    const mode = normalizeGenerationMode(String(formData.get("mode") ?? "general-sale"));
    const background = String(formData.get("background") ?? "").trim().slice(0, 500);
    const count = clampNumber(Number(formData.get("count") ?? 1), 1, MAX_RESULTS);
    const images = formData.getAll("images").filter((value): value is File => value instanceof File);

    if (!images.length) return errorResponse(ERROR_MESSAGES.missingImage, 400);
    if (images.length > MAX_IMAGES) return errorResponse(ERROR_MESSAGES.tooManyImages, 400);

    let encryptedApiKey: string | null;
    try {
      encryptedApiKey = await getEncryptedOpenAiApiKey(user.id);
    } catch (error) {
      if (error instanceof KnownServerError) return errorResponse(error.message, 500);
      return errorResponse(ERROR_MESSAGES.loadFailed, 500);
    }
    if (!encryptedApiKey) return errorResponse(ERROR_MESSAGES.missingKey, 400);

    let apiKey: string;
    try {
      apiKey = decryptSecretValue(encryptedApiKey);
    } catch (error) {
      if (error instanceof MissingEnvVarError) return errorResponse(error.message, 500);
      return errorResponse(ERROR_MESSAGES.decryptFailed, 500);
    }

    const uploadables = [];
    for (const image of images) {
      if (!ACCEPTED_TYPES.has(image.type)) {
        return errorResponse(ERROR_MESSAGES.invalidType, 400);
      }
      if (image.size > MAX_FILE_SIZE) {
        return errorResponse(ERROR_MESSAGES.tooLarge, 400);
      }

      const buffer = Buffer.from(await image.arrayBuffer());
      uploadables.push(await toFile(buffer, normalizeFilename(image.name, image.type), { type: image.type }));
    }

    const startedAt = Date.now();
    const clientKeyHash = createClientKeyHash(apiKey);
    const jobId = await createGenerationJob({
      userId: user.id,
      clientKeyHash,
      requestedCount: count,
      mode,
      backgroundPrompt: background,
    });

    const openai = new OpenAI({ apiKey });
    try {
      const result = await openai.images.edit({
        model: "gpt-image-1",
        image: uploadables,
        prompt: buildThumbnailPrompt(mode, background),
        n: count,
        size: "1024x1024",
        quality: "high",
        input_fidelity: "high",
        output_format: "png",
      });

      const processedImages = [];
      for (let index = 0; index < (result.data ?? []).length; index += 1) {
        const b64 = result.data?.[index]?.b64_json;
        if (!b64) continue;

        const output = await sharp(Buffer.from(b64, "base64"))
          .resize(1080, 1080, { fit: "cover", position: "center" })
          .modulate({
            brightness: 1.03,
            saturation: 1.04,
            hue: 1,
          })
          .sharpen({ sigma: 0.45, m1: 0.35, m2: 0.55 })
          .jpeg({ quality: 100, mozjpeg: false })
          .toBuffer();

        processedImages.push({
          filename: `thumbnail_${String(index + 1).padStart(2, "0")}.jpg`,
          dataUrl: `data:image/jpeg;base64,${output.toString("base64")}`,
        });
      }

      if (!processedImages.length) {
        await markGenerationJobError({
          id: jobId,
          errorMessage: ERROR_MESSAGES.generateFailed,
          durationMs: Date.now() - startedAt,
        });
        return NextResponse.json({ error: ERROR_MESSAGES.generateFailed, jobId }, { status: 502 });
      }

      await markGenerationJobSuccess({
        id: jobId,
        durationMs: Date.now() - startedAt,
      });

      return NextResponse.json({ images: processedImages, jobId });
    } catch (error) {
      if (error instanceof KnownServerError) {
        return NextResponse.json({ error: error.message, jobId }, { status: 500 });
      }

      const message = isAuthError(error)
        ? ERROR_MESSAGES.invalidKey
        : ERROR_MESSAGES.generateFailed;

      await markGenerationJobError({
        id: jobId,
        errorMessage: message,
        durationMs: Date.now() - startedAt,
      });

      return NextResponse.json(
        { error: message, jobId },
        { status: isAuthError(error) ? 401 : 500 },
      );
    }
  } catch (error) {
    if (error instanceof KnownServerError) {
      return errorResponse(error.message, 500);
    }
    if (isAuthError(error)) {
      return errorResponse(ERROR_MESSAGES.invalidKey, 401);
    }

    return errorResponse(ERROR_MESSAGES.generateFailed, 500);
  }
}

function isRateLimited(ip: string) {
  const now = Date.now();
  const current = rateLimitStore.get(ip);

  if (!current || current.resetAt <= now) {
    rateLimitStore.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }

  current.count += 1;
  return current.count > MAX_REQUESTS_PER_WINDOW;
}

function getClientIp(request: NextRequest) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwardedFor || request.headers.get("x-real-ip") || "local";
}

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(Math.trunc(value), min), max);
}

function normalizeFilename(filename: string, type: string) {
  const extension = type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
  const base = filename.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_-]/g, "_") || "meat";
  return `${base}.${extension}`;
}

function isAuthError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const status = "status" in error ? Number(error.status) : null;
  return status === 401 || status === 403;
}

function errorResponse(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}
