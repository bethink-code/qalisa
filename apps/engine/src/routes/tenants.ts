import { createTenant, generateApiKey } from "@qalisa/core";
import { apiKeys, db, tenants } from "@qalisa/db";
import { createApiKeySchema, createTenantSchema } from "@qalisa/shared";
import { eq } from "drizzle-orm";
import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler";

export const tenantsRouter: Router = Router();

// POST /v1/tenants — create a tenant + owner user (admin-provisioned).
tenantsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = createTenantSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input", issues: parsed.error.issues });
      return;
    }
    const result = await createTenant(db, parsed.data);
    res.status(201).json(result);
  }),
);

// POST /v1/tenants/:id/api-keys — issue an API key. Raw key is returned ONCE.
tenantsRouter.post(
  "/:id/api-keys",
  asyncHandler(async (req, res) => {
    const tenantId = req.params.id;
    if (!tenantId) {
      res.status(400).json({ error: "Missing tenant id" });
      return;
    }
    const [tenant] = await db
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);
    if (!tenant) {
      res.status(404).json({ error: "Tenant not found" });
      return;
    }

    const parsed = createApiKeySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input", issues: parsed.error.issues });
      return;
    }

    const { raw, hash } = generateApiKey();
    const [key] = await db
      .insert(apiKeys)
      .values({ tenantId, keyHash: hash, label: parsed.data.label, scopes: parsed.data.scopes })
      .returning({ id: apiKeys.id, label: apiKeys.label, scopes: apiKeys.scopes });

    // `key` (the raw value) is shown once and never recoverable afterwards.
    res.status(201).json({ ...key, key: raw });
  }),
);
