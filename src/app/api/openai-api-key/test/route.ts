import { NextRequest, NextResponse } from "next/server";
import {
  getDecryptedUserOpenAiApiKey,
  isValidOpenAiApiKey,
} from "@/lib/server/user-openai-api-key";
import { assertEncryptionSecretConfigured } from "@/lib/server/crypto";
import { KnownServerError } from "@/lib/server/errors";
import { requireUser } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) {
      return NextResponse.json(
        { error: "로그인 후 사용할 수 있습니다." },
        { status: 401 },
      );
    }

    const body = await request.json().catch(() => null) as { apiKey?: string } | null;
    const inputApiKey = body?.apiKey?.trim() ?? "";
    assertEncryptionSecretConfigured();
    const apiKey = inputApiKey || await getDecryptedUserOpenAiApiKey(user.id);

    if (!apiKey) {
      return NextResponse.json(
        { error: "테스트할 OpenAI API 키가 없습니다." },
        { status: 400 },
      );
    }
    if (!isValidOpenAiApiKey(apiKey)) {
      return NextResponse.json(
        { error: "OpenAI API 키 형식이 올바르지 않습니다." },
        { status: 400 },
      );
    }

    const testResult = await testOpenAiApiKey(apiKey);
    if (!testResult.ok) {
      return NextResponse.json(
        { error: testResult.error },
        { status: testResult.status },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof KnownServerError) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(
      { error: "API 키 연결 테스트에 실패했습니다." },
      { status: 500 },
    );
  }
}

async function testOpenAiApiKey(apiKey: string) {
  const response = await fetch("https://api.openai.com/v1/models", {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (response.ok) return { ok: true as const };

  if (response.status === 401 || response.status === 403) {
    return {
      ok: false as const,
      status: 401,
      error: "OpenAI API 키가 올바르지 않거나 권한이 없습니다.",
    };
  }

  return {
    ok: false as const,
    status: 502,
    error: "OpenAI API 연결 테스트에 실패했습니다. 잠시 후 다시 시도해 주세요.",
  };
}
