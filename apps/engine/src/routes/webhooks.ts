import { getAdapter } from "@qalisa/adapters";
import { updateDelivery } from "@qalisa/core";
import { db } from "@qalisa/db";
import { providerCredentials } from "@qalisa/db/schema";
import { and, eq } from "drizzle-orm";
import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { vault } from "../services";

export const webhooksRouter: Router = Router();

/**
 * POST /v1/webhooks/mailgun/:tenantId
 *
 * Mailgun cannot send bearer-auth headers, so the tenant is identified via the
 * URL path. The Mailgun webhook signing key (config.webhookSigningKey) verifies
 * the payload integrity — configure it in the tenant's credential config to
 * enable signature checking.
 */
webhooksRouter.post(
  "/mailgun/:tenantId",
  asyncHandler(async (req, res) => {
    const { tenantId } = req.params;
    if (!tenantId) {
      res.status(400).json({ error: "Missing tenantId" });
      return;
    }

    const [cred] = await db
      .select()
      .from(providerCredentials)
      .where(
        and(
          eq(providerCredentials.tenantId, tenantId),
          eq(providerCredentials.channel, "email"),
          eq(providerCredentials.provider, "mailgun"),
        ),
      )
      .limit(1);
    if (!cred) {
      res.status(404).json({ error: "No Mailgun credential found for tenant" });
      return;
    }

    const adapter = getAdapter("email", "mailgun");
    const secret = await vault.resolveSecret(cred.secretRef, tenantId);

    let events;
    try {
      events = await adapter.parseWebhook(
        {
          headers: req.headers as Record<string, string | string[] | undefined>,
          body: req.body,
        },
        { config: cred.config, secret },
      );
    } catch {
      res.status(400).json({ error: "Webhook verification failed" });
      return;
    }

    for (const event of events) {
      await updateDelivery(tenantId, event, { db });
    }

    res.status(200).json({ processed: events.length });
  }),
);
