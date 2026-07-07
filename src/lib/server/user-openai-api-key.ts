import { getPool, withMissingTableMessage } from "./db";
import { decryptSecretValue, encryptSecretValue } from "./crypto";

export type UserOpenAiApiKeyStatus = {
  hasKey: true;
  last4: string | null;
  updatedAt: string;
} | {
  hasKey: false;
};

const MISSING_TABLE_MESSAGE =
  "API 키 저장 테이블이 준비되지 않았습니다. docs/user-openai-api-keys.sql을 Supabase에서 실행했는지 확인해 주세요.";

export function isValidOpenAiApiKey(apiKey: string) {
  return /^sk-[A-Za-z0-9_-]{20,}$/.test(apiKey);
}

export async function getUserOpenAiApiKeyStatus(userId: string): Promise<UserOpenAiApiKeyStatus> {
  const result = await withMissingTableMessage(
    getPool().query<{
      api_key_last4: string | null;
      updated_at: Date;
    }>(
      `
        select api_key_last4, updated_at
        from user_openai_api_keys
        where user_id = $1
      `,
      [userId],
    ),
    MISSING_TABLE_MESSAGE,
  );

  const row = result.rows[0];
  if (!row) return { hasKey: false };

  return {
    hasKey: true,
    last4: row.api_key_last4,
    updatedAt: row.updated_at.toISOString(),
  };
}

export async function upsertUserOpenAiApiKey(input: {
  userId: string;
  apiKey: string;
}) {
  const encryptedApiKey = encryptSecretValue(input.apiKey);
  const last4 = input.apiKey.slice(-4);

  await withMissingTableMessage(
    getPool().query(
      `
        insert into user_openai_api_keys (
          user_id,
          encrypted_api_key,
          api_key_last4,
          created_at,
          updated_at
        )
        values ($1, $2, $3, now(), now())
        on conflict (user_id)
        do update set
          encrypted_api_key = excluded.encrypted_api_key,
          api_key_last4 = excluded.api_key_last4,
          updated_at = now()
      `,
      [input.userId, encryptedApiKey, last4],
    ),
    MISSING_TABLE_MESSAGE,
  );

  return { last4 };
}

export async function deleteUserOpenAiApiKey(userId: string) {
  await withMissingTableMessage(
    getPool().query(
      `
        delete from user_openai_api_keys
        where user_id = $1
      `,
      [userId],
    ),
    MISSING_TABLE_MESSAGE,
  );
}

export async function getEncryptedOpenAiApiKey(userId: string) {
  const result = await withMissingTableMessage(
    getPool().query<{ encrypted_api_key: string }>(
      `
        select encrypted_api_key
        from user_openai_api_keys
        where user_id = $1
      `,
      [userId],
    ),
    MISSING_TABLE_MESSAGE,
  );

  return result.rows[0]?.encrypted_api_key ?? null;
}

export async function getDecryptedUserOpenAiApiKey(userId: string) {
  const encryptedApiKey = await getEncryptedOpenAiApiKey(userId);
  if (!encryptedApiKey) return null;

  return decryptSecretValue(encryptedApiKey);
}
