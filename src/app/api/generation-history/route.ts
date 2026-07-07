import { NextResponse } from "next/server";
import { listGenerationJobs } from "@/lib/server/generation-jobs";
import { KnownServerError } from "@/lib/server/errors";
import { requireUser } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST() {
  try {
    const user = await requireUser();
    if (!user) {
      return NextResponse.json(
        { error: "로그인 후 사용할 수 있습니다." },
        { status: 401 },
      );
    }

    const jobs = await listGenerationJobs(user.id);

    return NextResponse.json({ jobs });
  } catch (error) {
    if (error instanceof KnownServerError) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(
      { error: "생성 이력을 불러오지 못했습니다." },
      { status: 500 },
    );
  }
}
