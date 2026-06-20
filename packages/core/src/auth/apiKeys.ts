import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const PREFIX = "qal_";

export interface GeneratedApiKey {
  /** The raw key — shown to the caller ONCE, never stored. */
  raw: string;
  /** SHA-256 hash of the raw key — this is what we persist and look up by. */
  hash: string;
}

/**
 * API keys are high-entropy random tokens (256 bits), so a fast hash (SHA-256)
 * is appropriate — unlike low-entropy passwords, they don't need a slow KDF.
 * We store only the hash; the raw key is unrecoverable from the database.
 */
export function generateApiKey(): GeneratedApiKey {
  const raw = PREFIX + randomBytes(32).toString("base64url");
  return { raw, hash: hashApiKey(raw) };
}

export function hashApiKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/** Constant-time string comparison for fixed secrets (e.g. the admin token). */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}
