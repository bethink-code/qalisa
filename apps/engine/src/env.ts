import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { z } from "zod";

// Load the single root .env (shared with docker-compose) before validating.
const here = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(here, "../../../.env") });

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  ENGINE_PORT: z.coerce.number().int().positive().default(4000),
  ENGINE_HOST: z.string().default("0.0.0.0"),
  LOG_LEVEL: z.string().default("info"),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url().default("redis://localhost:6380"),
  // Vault master key — 32 bytes, base64. Required from Phase 1.
  VAULT_MASTER_KEY: z.string().min(1, "VAULT_MASTER_KEY is required"),
  // Platform-admin token guarding tenant/api-key provisioning endpoints.
  ADMIN_API_TOKEN: z.string().min(16, "ADMIN_API_TOKEN must be at least 16 chars"),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
  throw new Error(`Invalid environment configuration:\n${issues}`);
}

export const env = parsed.data;
