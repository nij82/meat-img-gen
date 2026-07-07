import { NextResponse } from "next/server";
import { getPool } from "@/lib/server/db";

export const runtime = "nodejs";

const REQUIRED_ENV_VARS = [
  "DATABASE_URL",
  "API_KEY_HASH_SECRET",
  "OPENAI_API_KEY_ENCRYPTION_SECRET",
] as const;

const AUTH_ENV_VARS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
] as const;

type OkMissing = "ok" | "missing";
type OkError = "ok" | "error";
type TableStatus = "ok" | "missing" | "unknown";

export async function GET() {
  const missingRequiredEnvVars = REQUIRED_ENV_VARS.filter((name) => !process.env[name]);
  const missingAuthEnvVars = AUTH_ENV_VARS.filter((name) => !process.env[name]);

  const requiredEnv: OkMissing = missingRequiredEnvVars.length ? "missing" : "ok";
  const authEnv: OkMissing = missingAuthEnvVars.length ? "missing" : "ok";

  let database: OkError = "error";
  let tables: { generation_jobs: TableStatus; user_openai_api_keys: TableStatus } = {
    generation_jobs: "unknown",
    user_openai_api_keys: "unknown",
  };

  if (process.env.DATABASE_URL) {
    try {
      const pool = getPool();
      await pool.query("select 1");
      database = "ok";

      const result = await pool.query<{
        generation_jobs: boolean;
        user_openai_api_keys: boolean;
      }>(`
        select
          to_regclass('public.generation_jobs') is not null as generation_jobs,
          to_regclass('public.user_openai_api_keys') is not null as user_openai_api_keys
      `);

      const row = result.rows[0];
      tables = {
        generation_jobs: row?.generation_jobs ? "ok" : "missing",
        user_openai_api_keys: row?.user_openai_api_keys ? "ok" : "missing",
      };
    } catch {
      database = "error";
    }
  }

  const missingEnvVars = [...missingRequiredEnvVars, ...missingAuthEnvVars];

  const healthy =
    requiredEnv === "ok" &&
    authEnv === "ok" &&
    database === "ok" &&
    tables.generation_jobs === "ok" &&
    tables.user_openai_api_keys === "ok";

  return NextResponse.json(
    {
      app: "ok",
      database,
      requiredEnv,
      authEnv,
      missingEnvVars,
      tables,
    },
    { status: healthy ? 200 : 503 },
  );
}
