import { NextRequest, NextResponse } from "next/server";
import {
  deleteUserOpenAiApiKey,
  getUserOpenAiApiKeyStatus,
  isValidOpenAiApiKey,
  upsertUserOpenAiApiKey,
} from "@/lib/server/user-openai-api-key";
import { KnownServerError } from "@/lib/server/errors";
import { requireUser } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireUser();
    if (!user) return unauthorizedResponse();

    return NextResponse.json(await getUserOpenAiApiKeyStatus(user.id));
  } catch (error) {
    if (error instanceof KnownServerError) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(
      { error: "저장된 OpenAI API 키를 불러오지 못했습니다." },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return unauthorizedResponse();

    const body = await request.json().catch(() => null) as { apiKey?: string } | null;
    const apiKey = body?.apiKey?.trim() ?? "";
    if (!isValidOpenAiApiKey(apiKey)) {
      return NextResponse.json(
        { error: "OpenAI API 키 형식이 올바르지 않습니다." },
        { status: 400 },
      );
    }

    const { last4 } = await upsertUserOpenAiApiKey({ userId: user.id, apiKey });

    return NextResponse.json({ ok: true, last4 });
  } catch (error) {
    if (error instanceof KnownServerError) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(
      { error: "API 키를 저장하지 못했습니다." },
      { status: 500 },
    );
  }
}

export async function DELETE() {
  try {
    const user = await requireUser();
    if (!user) return unauthorizedResponse();

    await deleteUserOpenAiApiKey(user.id);

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof KnownServerError) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(
      { error: "API 키를 삭제하지 못했습니다." },
      { status: 500 },
    );
  }
}

function unauthorizedResponse() {
  return NextResponse.json(
    { error: "로그인 후 사용할 수 있습니다." },
    { status: 401 },
  );
}
