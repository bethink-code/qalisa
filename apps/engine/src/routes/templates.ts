import { db, templates } from "@qalisa/db";
import { providerCredentials } from "@qalisa/db/schema";
import { CHANNELS, createTemplateSchema, submitWhatsappSchema, updateTemplateSchema } from "@qalisa/shared";
import { and, eq } from "drizzle-orm";
import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { vault } from "../services";

export const templatesRouter: Router = Router();

/** Fields safe to return — tenantId is never exposed. */
const SAFE_COLUMNS = {
  id: templates.id,
  channel: templates.channel,
  name: templates.name,
  body: templates.body,
  variables: templates.variables,
  whatsappStatus: templates.whatsappStatus,
  metaTemplateName: templates.metaTemplateName,
  whatsappCategory: templates.whatsappCategory,
  whatsappLanguage: templates.whatsappLanguage,
  whatsappRejectionReason: templates.whatsappRejectionReason,
  createdAt: templates.createdAt,
};

// POST /v1/templates — create a template for the tenant's channel.
templatesRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const tenantId = req.tenantId;
    if (!tenantId) { res.status(401).json({ error: "Unauthenticated" }); return; }

    const parsed = createTemplateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input", issues: parsed.error.issues });
      return;
    }
    const { channel, name, body, variables } = parsed.data;

    const [created] = await db
      .insert(templates)
      .values({
        tenantId,
        channel,
        name,
        body,
        variables,
        // WhatsApp templates must go through Meta approval before sending.
        whatsappStatus: channel === "whatsapp" ? "pending" : null,
      })
      .returning(SAFE_COLUMNS);

    res.status(201).json(created);
  }),
);

// GET /v1/templates — list the tenant's templates (optionally filtered by channel).
templatesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const tenantId = req.tenantId;
    if (!tenantId) { res.status(401).json({ error: "Unauthenticated" }); return; }

    const channelFilter = typeof req.query["channel"] === "string" ? req.query["channel"] : null;
    if (channelFilter && !(CHANNELS as readonly string[]).includes(channelFilter)) {
      res.status(400).json({ error: `Invalid channel '${channelFilter}'` });
      return;
    }

    const rows = await db
      .select(SAFE_COLUMNS)
      .from(templates)
      .where(
        channelFilter
          ? and(eq(templates.tenantId, tenantId), eq(templates.channel, channelFilter as "email" | "sms" | "whatsapp"))
          : eq(templates.tenantId, tenantId),
      );

    res.json(rows);
  }),
);

// GET /v1/templates/:id — fetch a single template.
templatesRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const tenantId = req.tenantId;
    if (!tenantId) { res.status(401).json({ error: "Unauthenticated" }); return; }

    const [row] = await db
      .select(SAFE_COLUMNS)
      .from(templates)
      .where(and(eq(templates.id, req.params.id ?? ""), eq(templates.tenantId, tenantId)))
      .limit(1);

    if (!row) { res.status(404).json({ error: "Template not found" }); return; }
    res.json(row);
  }),
);

// PATCH /v1/templates/:id — update name, body, or variables.
templatesRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const tenantId = req.tenantId;
    if (!tenantId) { res.status(401).json({ error: "Unauthenticated" }); return; }

    const parsed = updateTemplateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input", issues: parsed.error.issues });
      return;
    }
    if (Object.keys(parsed.data).length === 0) {
      res.status(400).json({ error: "No fields to update" });
      return;
    }

    const updates = parsed.data;

    const [updated] = await db
      .update(templates)
      .set(updates)
      .where(and(eq(templates.id, req.params.id ?? ""), eq(templates.tenantId, tenantId)))
      .returning(SAFE_COLUMNS);

    if (!updated) { res.status(404).json({ error: "Template not found" }); return; }
    res.json(updated);
  }),
);

// DELETE /v1/templates/:id — remove a template (tenant-scoped).
templatesRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const tenantId = req.tenantId;
    if (!tenantId) { res.status(401).json({ error: "Unauthenticated" }); return; }

    const [deleted] = await db
      .delete(templates)
      .where(and(eq(templates.id, req.params.id ?? ""), eq(templates.tenantId, tenantId)))
      .returning({ id: templates.id });

    if (!deleted) { res.status(404).json({ error: "Template not found" }); return; }
    res.status(204).send();
  }),
);

// POST /v1/templates/:id/submit-whatsapp — submit a WhatsApp template to Meta for approval.
templatesRouter.post(
  "/:id/submit-whatsapp",
  asyncHandler(async (req, res) => {
    const tenantId = req.tenantId;
    if (!tenantId) { res.status(401).json({ error: "Unauthenticated" }); return; }

    const parsed = submitWhatsappSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input", issues: parsed.error.issues });
      return;
    }
    const { category, language } = parsed.data;

    const [template] = await db
      .select(SAFE_COLUMNS)
      .from(templates)
      .where(and(eq(templates.id, req.params.id ?? ""), eq(templates.tenantId, tenantId)))
      .limit(1);

    if (!template) { res.status(404).json({ error: "Template not found" }); return; }
    if (template.channel !== "whatsapp") {
      res.status(400).json({ error: "Only WhatsApp templates can be submitted to Meta" });
      return;
    }
    if (template.whatsappStatus === "approved") {
      res.status(409).json({ error: "Template is already approved" });
      return;
    }

    const [cred] = await db
      .select({ secretRef: providerCredentials.secretRef, config: providerCredentials.config })
      .from(providerCredentials)
      .where(
        and(
          eq(providerCredentials.tenantId, tenantId),
          eq(providerCredentials.channel, "whatsapp"),
          eq(providerCredentials.provider, "meta_cloud_api"),
        ),
      )
      .limit(1);

    if (!cred) {
      res.status(422).json({ error: "No Meta Cloud API credential configured for this account" });
      return;
    }

    const wabaId = typeof cred.config?.wabaId === "string" ? cred.config.wabaId : "";
    if (!wabaId) {
      res.status(422).json({ error: "Meta credential is missing wabaId" });
      return;
    }

    const secret = await vault.resolveSecret(cred.secretRef, tenantId);
    const token = secret.reveal();

    // Build Meta template name: lowercase alphanumeric + underscores only.
    const metaTemplateName = template.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");

    // Map named variables {{varName}} → positional {{1}}, {{2}}, … for Meta.
    const varNames: string[] = [];
    const varPattern = /\{\{(\w+)\}\}/g;
    let match: RegExpExecArray | null;
    while ((match = varPattern.exec(template.body)) !== null) {
      const v = match[1];
      if (v && !varNames.includes(v)) varNames.push(v);
    }
    const positionalBody = varNames.reduce(
      (text, v, i) => text.replaceAll(`{{${v}}}`, `{{${i + 1}}}`),
      template.body,
    );

    const metaRes = await fetch(
      `https://graph.facebook.com/v21.0/${wabaId}/message_templates`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          name: metaTemplateName,
          category,
          language,
          components: [{ type: "BODY", text: positionalBody }],
        }),
        signal: AbortSignal.timeout(15_000),
      },
    );

    if (!metaRes.ok) {
      const err = (await metaRes.json().catch(() => ({}))) as { error?: { message?: string } };
      res.status(metaRes.status).json({
        error: `Meta rejected template: ${err.error?.message ?? metaRes.statusText}`,
      });
      return;
    }

    const [updated] = await db
      .update(templates)
      .set({ whatsappStatus: "pending", metaTemplateName, whatsappCategory: category, whatsappLanguage: language })
      .where(and(eq(templates.id, req.params.id ?? ""), eq(templates.tenantId, tenantId)))
      .returning(SAFE_COLUMNS);

    res.json(updated);
  }),
);
