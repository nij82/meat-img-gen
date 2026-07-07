import { getPool, withMissingTableMessage } from "./db";
import type { GenerationMode } from "@/lib/generation-mode-guidelines";

export type GenerationJobStatus = "running" | "success" | "error";

export type GenerationJobRecord = {
  id: string;
  created_at: string;
  completed_at: string | null;
  requested_count: number;
  mode: GenerationMode;
  background_prompt: string;
  status: GenerationJobStatus;
  error_message: string | null;
  duration_ms: number | null;
};

const MISSING_TABLE_MESSAGE =
  "생성 이력 테이블이 준비되지 않았습니다. docs/generation-jobs.sql을 Supabase에서 실행했는지 확인해 주세요.";

export async function createGenerationJob(input: {
  userId: string;
  clientKeyHash: string;
  requestedCount: number;
  mode: GenerationMode;
  backgroundPrompt: string;
}) {
  const result = await withMissingTableMessage(
    getPool().query<{ id: string }>(
      `
        insert into generation_jobs (
          user_id,
          client_key_hash,
          requested_count,
          mode,
          background_prompt,
          status
        )
        values ($1, $2, $3, $4, $5, 'running')
        returning id
      `,
      [
        input.userId,
        input.clientKeyHash,
        input.requestedCount,
        input.mode,
        input.backgroundPrompt,
      ],
    ),
    MISSING_TABLE_MESSAGE,
  );

  return result.rows[0].id;
}

export async function markGenerationJobSuccess(input: {
  id: string;
  durationMs: number;
}) {
  await withMissingTableMessage(
    getPool().query(
      `
        update generation_jobs
        set status = 'success',
            completed_at = now(),
            duration_ms = $2,
            error_message = null
        where id = $1
      `,
      [input.id, input.durationMs],
    ),
    MISSING_TABLE_MESSAGE,
  );
}

export async function markGenerationJobError(input: {
  id: string;
  errorMessage: string;
  durationMs: number;
}) {
  await withMissingTableMessage(
    getPool().query(
      `
        update generation_jobs
        set status = 'error',
            completed_at = now(),
            duration_ms = $2,
            error_message = $3
        where id = $1
      `,
      [input.id, input.durationMs, input.errorMessage],
    ),
    MISSING_TABLE_MESSAGE,
  );
}

export async function listGenerationJobs(userId: string) {
  const result = await withMissingTableMessage(
    getPool().query<{
      id: string;
      created_at: Date;
      completed_at: Date | null;
      requested_count: number;
      mode: GenerationMode;
      background_prompt: string;
      status: GenerationJobStatus;
      error_message: string | null;
      duration_ms: number | null;
    }>(
      `
        select
          id,
          created_at,
          completed_at,
          requested_count,
          mode,
          background_prompt,
          status,
          error_message,
          duration_ms
        from generation_jobs
        where user_id = $1
        order by created_at desc
        limit 50
      `,
      [userId],
    ),
    MISSING_TABLE_MESSAGE,
  );

  return result.rows.map((row) => ({
    id: row.id,
    created_at: row.created_at.toISOString(),
    completed_at: row.completed_at?.toISOString() ?? null,
    requested_count: row.requested_count,
    mode: row.mode,
    background_prompt: row.background_prompt,
    status: row.status,
    error_message: row.error_message,
    duration_ms: row.duration_ms,
  })) satisfies GenerationJobRecord[];
}
