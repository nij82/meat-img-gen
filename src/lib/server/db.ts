import { Pool } from "pg";
import { KnownServerError } from "./errors";
import { requireEnvVar } from "./env";

const globalForPg = globalThis as typeof globalThis & {
  generationJobsPool?: Pool;
};

export function getPool() {
  const connectionString = requireEnvVar("DATABASE_URL");

  globalForPg.generationJobsPool ??= new Pool({
    connectionString,
  });

  return globalForPg.generationJobsPool;
}

export class MissingTableError extends KnownServerError {}

const UNDEFINED_TABLE_ERROR_CODE = "42P01";

function isMissingRelationError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === UNDEFINED_TABLE_ERROR_CODE
  );
}

export async function withMissingTableMessage<T>(query: Promise<T>, message: string): Promise<T> {
  try {
    return await query;
  } catch (error) {
    if (isMissingRelationError(error)) {
      throw new MissingTableError(message);
    }
    throw error;
  }
}
