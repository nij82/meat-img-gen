import { createHmac } from "crypto";
import { requireEnvVar } from "./env";

export function createClientKeyHash(apiKey: string) {
  const secret = requireEnvVar("API_KEY_HASH_SECRET");

  return createHmac("sha256", secret).update(apiKey).digest("hex");
}
