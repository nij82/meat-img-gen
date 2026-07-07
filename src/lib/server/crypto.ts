import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { requireEnvVar } from "./env";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const ENCODING = "base64url";
const VERSION = "v1";

function getEncryptionKey() {
  const secret = requireEnvVar("OPENAI_API_KEY_ENCRYPTION_SECRET");

  return createHash("sha256").update(secret).digest();
}

export function assertEncryptionSecretConfigured() {
  requireEnvVar("OPENAI_API_KEY_ENCRYPTION_SECRET");
}

export function encryptSecretValue(value: string) {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getEncryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    VERSION,
    iv.toString(ENCODING),
    authTag.toString(ENCODING),
    ciphertext.toString(ENCODING),
  ].join(":");
}

export function decryptSecretValue(encryptedValue: string) {
  const [version, ivValue, authTagValue, ciphertextValue] = encryptedValue.split(":");
  if (version !== VERSION || !ivValue || !authTagValue || !ciphertextValue) {
    throw new Error("Invalid encrypted value format");
  }

  const decipher = createDecipheriv(
    ALGORITHM,
    getEncryptionKey(),
    Buffer.from(ivValue, ENCODING),
  );
  decipher.setAuthTag(Buffer.from(authTagValue, ENCODING));

  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, ENCODING)),
    decipher.final(),
  ]).toString("utf8");
}
