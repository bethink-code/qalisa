import { getAdapter } from "@qalisa/adapters";
import { db, providerCredentials } from "@qalisa/db";
import { PROVIDERS_BY_CHANNEL, upsertCredentialSchema } from "@qalisa/shared";
import { and, eq } from "drizzle-orm";
import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { vault } from "../services";

export const credentialsRouter: Router = Router();

/** Fields safe to return — never secretRef or tenantId. */
const SAFE_COLUMNS = {
  id: providerCredentials.id,
  channel: providerCredentials.channel,
  provider: providerCredentials.provider,
  config: providerCredentials.config,
  status: providerCredentials.status,
  lastHealthCheckAt: providerCredentials.lastHealthCheckAt,
  tokenExpiresAt: providerCredentials.tokenExpiresAt,
  createdAt: providerCredentials.createdAt,
};

// POST /v1/credentials — store/replace a tenant's provider credentials in the vault.
credentialsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const tenantId = req.tenantId;
    if (!tenantId) {
      res.status(401).json({ error: "Unauthenticated" });
      return;
    }

    const parsed = upsertCredentialSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input", issues: parsed.error.issues });
      return;
    }
    const { channel, provider, config, secret } = parsed.data;

    const allowed: readonly string[] = PROVIDERS_BY_CHANNEL[channel];
    if (!allowed.includes(provider)) {
      res.status(400).json({ error: `Provider '${provider}' is not valid for channel '${channel}'` });
      return;
    }

    const [existing] = await db
      .select({ id: providerCredentials.id, secretRef: providerCredentials.secretRef })
      .from(providerCredentials)
      .where(
        and(
          eq(providerCredentials.tenantId, tenantId),
          eq(providerCredentials.channel, channel),
          eq(providerCredentials.provider, provider),
        ),
      )
      .limit(1);

    const secretRef = await vault.storeSecret(tenantId, secret);

    if (existing) {
      const [updated] = await db
        .update(providerCredentials)
        .set({ secretRef, config, status: "unverified", lastHealthCheckAt: null })
        .where(
          and(eq(providerCredentials.id, existing.id), eq(providerCredentials.tenantId, tenantId)),
        )
        .returning(SAFE_COLUMNS);
      await vault.deleteSecret(existing.secretRef, tenantId); // drop the replaced secret
      res.json(updated);
      return;
    }

    const [created] = await db
      .insert(providerCredentials)
      .values({ tenantId, channel, provider, secretRef, config })
      .returning(SAFE_COLUMNS);
    res.status(201).json(created);
  }),
);

// POST /v1/credentials/:id/test — run the adapter health check, persist status.
credentialsRouter.post(
  "/:id/test",
  asyncHandler(async (req, res) => {
    const tenantId = req.tenantId;
    if (!tenantId) {
      res.status(401).json({ error: "Unauthenticated" });
      return;
    }
    const credentialId = req.params.id;
    if (!credentialId) {
      res.status(400).json({ error: "Missing credential id" });
      return;
    }

    const [cred] = await db
      .select()
      .from(providerCredentials)
      .where(
        and(eq(providerCredentials.id, credentialId), eq(providerCredentials.tenantId, tenantId)),
      )
      .limit(1);
    if (!cred) {
      res.status(404).json({ error: "Credential not found" });
      return;
    }

    const secret = await vault.resolveSecret(cred.secretRef, tenantId);
    const adapter = getAdapter(cred.channel, cred.provider);
    const health = await adapter.validateCredentials(cred.config, secret);

    const status = health.ok ? "healthy" : "failing";
    await db
      .update(providerCredentials)
      .set({
        status,
        lastHealthCheckAt: new Date(),
        tokenExpiresAt: health.tokenExpiresAt ?? cred.tokenExpiresAt,
      })
      .where(
        and(eq(providerCredentials.id, cred.id), eq(providerCredentials.tenantId, tenantId)),
      );

    res.json({ status, detail: health.detail });
  }),
);

// GET /v1/credentials — list the tenant's configured providers + health status.
credentialsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const tenantId = req.tenantId;
    if (!tenantId) {
      res.status(401).json({ error: "Unauthenticated" });
      return;
    }
    const rows = await db
      .select(SAFE_COLUMNS)
      .from(providerCredentials)
      .where(eq(providerCredentials.tenantId, tenantId));
    res.json(rows);
  }),
);

// DELETE /v1/credentials/:id — remove a credential and its vault secret.
credentialsRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const tenantId = req.tenantId;
    if (!tenantId) { res.status(401).json({ error: "Unauthenticated" }); return; }

    const [cred] = await db
      .select({ id: providerCredentials.id, secretRef: providerCredentials.secretRef })
      .from(providerCredentials)
      .where(
        and(eq(providerCredentials.id, req.params.id ?? ""), eq(providerCredentials.tenantId, tenantId)),
      )
      .limit(1);
    if (!cred) { res.status(404).json({ error: "Credential not found" }); return; }

    await db
      .delete(providerCredentials)
      .where(and(eq(providerCredentials.id, cred.id), eq(providerCredentials.tenantId, tenantId)));
    await vault.deleteSecret(cred.secretRef, tenantId);
    res.status(204).send();
  }),
);
