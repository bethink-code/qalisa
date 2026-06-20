import { z } from "zod";
import { channelSchema, providerSchema } from "./enums";

/**
 * Payload for POST /v1/credentials. The raw `secret` is in transit only — it is
 * encrypted into the vault server-side and is NEVER stored or logged in clear.
 * `config` holds non-secret provider settings (e.g. Mailgun domain, WABA id).
 */
export const upsertCredentialSchema = z.object({
  channel: channelSchema,
  provider: providerSchema,
  config: z.record(z.unknown()).default({}),
  secret: z.string().min(1, "secret is required"),
});

export type UpsertCredentialInput = z.infer<typeof upsertCredentialSchema>;
