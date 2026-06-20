import { z } from "zod";

/** Payload for POST /v1/tenants (admin-provisioned). */
export const createTenantSchema = z.object({
  name: z.string().min(1, "name is required"),
  ownerEmail: z.string().email(),
});
export type CreateTenantBody = z.infer<typeof createTenantSchema>;

/** Payload for POST /v1/tenants/:id/api-keys. */
export const createApiKeySchema = z.object({
  label: z.string().min(1, "label is required"),
  scopes: z.array(z.string()).default([]),
});
export type CreateApiKeyBody = z.infer<typeof createApiKeySchema>;
