import { getAdapter } from "@qalisa/adapters";
import { updateDelivery } from "@qalisa/core";
import { db } from "@qalisa/db";
import { providerCredentials } from "@qalisa/db/schema";
import type { Channel, Provider } from "@qalisa/shared";
import { and, eq } from "drizzle-orm";
import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { vault } from "../services";

export const webhooksRouter: Router = Router();

/** Shared handler: resolve credential, call adapter.parseWebhook, update delivery status. */
async function handleProviderWebhook(
  tenantId: string,
  channel: Channel,
  provider: Provider,
  req: { headers: Record<string, string | string[] | undefined>; body: unknown },
): Promise<number> {
  const [cred] = await db
    .select()
    .from(providerCredentials)
    .where(
      and(
        eq(providerCredentials.tenantId, tenantId),
        eq(providerCredentials.channel, channel),
        eq(providerCredentials.provider, provider),
      ),
    )
    .limit(1);
  if (!cred) throw Object.assign(new Error(`No ${provider} credential found for tenant`), { statusCode: 404 });

  const adapter = getAdapter(channel, provider);
  const secret = await vault.resolveSecret(cred.secretRef, tenantId);
  const events = await adapter.parseWebhook(
    { headers: req.headers, body: req.body },
    { config: cred.config, secret },
  );

  for (const event of events) {
    await updateDelivery(tenantId, event, { db });
  }
  return events.length;
}

/**
 * POST /v1/webhooks/mailgun/:tenantId
 *
 * Tenant identified via URL path (Mailgun cannot send bearer-auth headers).
 * Configure config.webhookSigningKey on the credential to enable HMAC-SHA256
 * payload verification.
 */
webhooksRouter.post(
  "/mailgun/:tenantId",
  asyncHandler(async (req, res) => {
    const { tenantId } = req.params;
    if (!tenantId) { res.status(400).json({ error: "Missing tenantId" }); return; }

    try {
      const processed = await handleProviderWebhook(tenantId, "email", "mailgun", {
        headers: req.headers as Record<string, string | string[] | undefined>,
        body: req.body,
      });
      res.status(200).json({ processed });
    } catch (err) {
      const code = (err as { statusCode?: number }).statusCode;
      if (code === 404) { res.status(404).json({ error: (err as Error).message }); return; }
      res.status(400).json({ error: "Webhook verification failed" });
    }
  }),
);

/**
 * POST /v1/webhooks/smsportal/:tenantId
 *
 * SMSPortal delivery receipt callback. SMSPortal does not sign callbacks, so
 * the tenantId-scoped URL path is the only authentication mechanism.
 */
webhooksRouter.post(
  "/smsportal/:tenantId",
  asyncHandler(async (req, res) => {
    const { tenantId } = req.params;
    if (!tenantId) { res.status(400).json({ error: "Missing tenantId" }); return; }

    try {
      const processed = await handleProviderWebhook(tenantId, "sms", "smsportal", {
        headers: req.headers as Record<string, string | string[] | undefined>,
        body: req.body,
      });
      res.status(200).json({ processed });
    } catch (err) {
      const code = (err as { statusCode?: number }).statusCode;
      res.status(code ?? 500).json({ error: (err as Error).message });
    }
  }),
);
