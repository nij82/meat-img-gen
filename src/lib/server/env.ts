import { KnownServerError } from "./errors";

export const REQUIRED_SERVER_ENV_VARS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "DATABASE_URL",
  "API_KEY_HASH_SECRET",
  "OPENAI_API_KEY_ENCRYPTION_SECRET",
] as const;

export type RequiredServerEnvVar = (typeof REQUIRED_SERVER_ENV_VARS)[number];

export class MissingEnvVarError extends KnownServerError {
  constructor(public readonly envVarName: RequiredServerEnvVar) {
    super(`서버 환경변수 ${envVarName}이 설정되지 않았습니다.`);
  }
}

export function requireEnvVar(name: RequiredServerEnvVar): string {
  const value = process.env[name];
  if (!value) {
    throw new MissingEnvVarError(name);
  }
  return value;
}

export function isMissingEnvVarError(error: unknown): error is MissingEnvVarError {
  return error instanceof MissingEnvVarError;
}
