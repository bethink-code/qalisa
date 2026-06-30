import { getAdapter } from "@qalisa/adapters";
import { updateDelivery } from "@qalisa/core";
import { db } from "@qalisa/db";
import { providerCredentials, templates } from "@qalisa/db/schema";
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
  req: { headers: Record<string, string | string[] | undefined>; body: unknown; rawBody?: Buffer },
  webhookSecret?: string,
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

  // Verify path secret for providers that don't sign their callbacks.
  if (webhookSecret !== undefined) {
    const stored = typeof cred.config?.webhookSecret === "string" ? cred.config.webhookSecret : null;
    if (!stored || webhookSecret !== stored) {
      throw Object.assign(new Error("Invalid webhook secret"), { statusCode: 403 });
    }
  }

  const adapter = getAdapter(channel, provider);
  const secret = await vault.resolveSecret(cred.secretRef, tenantId);
  const events = await adapter.parseWebhook(
    { headers: req.headers, body: req.body, rawBody: req.rawBody },
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
        rawBody: req.rawBody,
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
 * POST /v1/webhooks/mailjet/:tenantId/:secret
 *
 * Mailjet Event API callback. Mailjet does not sign callbacks; the
 * :secret path segment (stored in credential config) is the auth gate.
 */
webhooksRouter.post(
  "/mailjet/:tenantId/:secret",
  asyncHandler(async (req, res) => {
    const { tenantId, secret } = req.params;
    if (!tenantId) { res.status(400).json({ error: "Missing tenantId" }); return; }

    try {
      const processed = await handleProviderWebhook(tenantId, "email", "mailjet", {
        headers: req.headers as Record<string, string | string[] | undefined>,
        body: req.body,
        rawBody: req.rawBody,
      }, secret);
      res.status(200).json({ processed });
    } catch (err) {
      const code = (err as { statusCode?: number }).statusCode;
      res.status(code ?? 500).json({ error: (err as Error).message });
    }
  }),
);

/**
 * POST /v1/webhooks/smsportal/:tenantId/:secret
 *
 * SMSPortal delivery receipt callback. SMSPortal does not sign callbacks; the
 * :secret path segment (stored in credential config) is the auth gate.
 */
webhooksRouter.post(
  "/smsportal/:tenantId/:secret",
  asyncHandler(async (req, res) => {
    const { tenantId, secret } = req.params;
    if (!tenantId) { res.status(400).json({ error: "Missing tenantId" }); return; }

    try {
      const processed = await handleProviderWebhook(tenantId, "sms", "smsportal", {
        headers: req.headers as Record<string, string | string[] | undefined>,
        body: req.body,
        rawBody: req.rawBody,
      }, secret);
      res.status(200).json({ processed });
    } catch (err) {
      const code = (err as { statusCode?: number }).statusCode;
      res.status(code ?? 500).json({ error: (err as Error).message });
    }
  }),
);

/**
 * GET /v1/webhooks/meta/:tenantId — Meta webhook endpoint verification challenge.
 * Meta calls this once when configuring a webhook subscription.
 * config.webhookVerifyToken must match hub.verify_token for the challenge to pass.
 */
webhooksRouter.get(
  "/meta/:tenantId",
  asyncHandler(async (req, res) => {
    const { tenantId } = req.params;
    const mode = req.query["hub.mode"];
    const challenge = req.query["hub.challenge"];
    const verifyToken = req.query["hub.verify_token"];

    if (mode !== "subscribe" || !challenge) {
      res.status(400).json({ error: "Invalid hub challenge request" });
      return;
    }

    const [cred] = await db
      .select({ config: providerCredentials.config })
      .from(providerCredentials)
      .where(
        and(
          eq(providerCredentials.tenantId, tenantId ?? ""),
          eq(providerCredentials.channel, "whatsapp"),
          eq(providerCredentials.provider, "meta_cloud_api"),
        ),
      )
      .limit(1);

    const expected = cred?.config?.["webhookVerifyToken"];
    if (!expected || expected !== verifyToken) {
      res.status(403).json({ error: "Verify token mismatch" });
      return;
    }

    res.status(200).send(String(challenge));
  }),
);

/**
 * Process template-related webhook fields — call only after HMAC is verified.
 * Handles: message_template_status_update, template_category_update
 */
async function handleTemplateWebhooks(tenantId: string, body: unknown): Promise<number> {
  const b = body as Record<string, unknown>;
  if (b["object"] !== "whatsapp_business_account") return 0;
  const entries = b["entry"] as Record<string, unknown>[] | undefined;
  if (!Array.isArray(entries)) return 0;

  let count = 0;
  for (const entry of entries) {
    const changes = entry["changes"] as Record<string, unknown>[] | undefined;
    if (!Array.isArray(changes)) continue;
    for (const change of changes) {
      const field = String(change["field"] ?? "");
      const value = change["value"] as Record<string, unknown> | undefined;
      if (!value) continue;

      if (field === "message_template_status_update") {
        const event = String(value["event"] ?? "").toUpperCase();
        const metaTemplateName = String(value["message_template_name"] ?? "");
        const reason = typeof value["reason"] === "string" ? value["reason"] : null;
        if (!metaTemplateName || !event) continue;

        // Map Meta events to our internal status.
        // APPROVED / REINSTATED → approved
        // REJECTED / DISABLED / FLAGGED / PAUSED → rejected
        // PENDING / IN_APPEAL → pending (back in review after edit)
        const newStatus: "approved" | "rejected" | "pending" | null =
          event === "APPROVED" || event === "REINSTATED" ? "approved"
          : event === "REJECTED" || event === "DISABLED" || event === "FLAGGED" || event === "PAUSED" ? "rejected"
          : event === "PENDING" || event === "IN_APPEAL" ? "pending"
          : null;

        if (!newStatus) continue;

        const rows = await db
          .update(templates)
          .set({
            whatsappStatus: newStatus,
            whatsappRejectionReason: newStatus === "rejected" && reason ? reason : null,
          })
          .where(and(eq(templates.tenantId, tenantId), eq(templates.metaTemplateName, metaTemplateName)))
          .returning({ id: templates.id });
        count += rows.length;
      }

      if (field === "template_category_update") {
        // Meta has reclassified the template (e.g. UTILITY → MARKETING).
        const metaTemplateName = String(value["message_template_name"] ?? "");
        const newCategory = String(value["new_category"] ?? "");
        if (!metaTemplateName || !newCategory) continue;

        const rows = await db
          .update(templates)
          .set({ whatsappCategory: newCategory })
          .where(and(eq(templates.tenantId, tenantId), eq(templates.metaTemplateName, metaTemplateName)))
          .returning({ id: templates.id });
        count += rows.length;
      }
    }
  }
  return count;
}

/**
 * POST /v1/webhooks/meta/:tenantId — Meta delivery status and template status callbacks.
 * Signature is verified via X-Hub-Signature-256 when config.appSecret is set.
 */
webhooksRouter.post(
  "/meta/:tenantId",
  asyncHandler(async (req, res) => {
    const { tenantId } = req.params;
    if (!tenantId) { res.status(400).json({ error: "Missing tenantId" }); return; }

    try {
      // handleProviderWebhook verifies the HMAC signature before processing.
      const processed = await handleProviderWebhook(tenantId, "whatsapp", "meta_cloud_api", {
        headers: req.headers as Record<string, string | string[] | undefined>,
        body: req.body,
        rawBody: req.rawBody,
      });
      // Signature verified — now process template status/category events.
      const templateUpdates = await handleTemplateWebhooks(tenantId, req.body);
      res.status(200).json({ processed, templateUpdates });
    } catch (err) {
      const code = (err as { statusCode?: number }).statusCode;
      if (code === 404) { res.status(404).json({ error: (err as Error).message }); return; }
      res.status(400).json({ error: "Webhook verification failed" });
    }
  }),
);
