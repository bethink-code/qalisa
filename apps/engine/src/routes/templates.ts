import { db, templates } from "@qalisa/db";
import { providerCredentials } from "@qalisa/db/schema";
import type { WaButton, WaComponents, WaHeader } from "@qalisa/shared";
import { CHANNELS, createTemplateSchema, submitWhatsappSchema, updateTemplateSchema } from "@qalisa/shared";
import { and, eq } from "drizzle-orm";
import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { vault } from "../services";

export const templatesRouter: Router = Router();

const GRAPH_URL = "https://graph.facebook.com/v23.0";

/** Fields safe to return — tenantId never exposed. */
const SAFE_COLUMNS = {
  id: templates.id,
  channel: templates.channel,
  name: templates.name,
  body: templates.body,
  variables: templates.variables,
  whatsappStatus: templates.whatsappStatus,
  metaTemplateName: templates.metaTemplateName,
  metaTemplateId: templates.metaTemplateId,
  whatsappCategory: templates.whatsappCategory,
  whatsappLanguage: templates.whatsappLanguage,
  whatsappRejectionReason: templates.whatsappRejectionReason,
  components: templates.components,
  parameterFormat: templates.parameterFormat,
  createdAt: templates.createdAt,
};

/** Extract unique named variable names in appearance order from a template string. */
function extractVarNames(text: string): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const [, name] of text.matchAll(/\{\{(\w+)\}\}/g)) {
    if (name && !seen.has(name)) { seen.add(name); names.push(name); }
  }
  return names;
}

/** Build the Meta API components array for MARKETING/UTILITY templates. */
function buildMetaComponents(comp: WaComponents): unknown[] {
  const out: unknown[] = [];

  // Header
  if (comp.header) {
    const h: WaHeader = comp.header;
    if (h.format === "TEXT" && h.text) {
      const hasVar = !!h.varName;
      out.push({
        type: "HEADER",
        format: "TEXT",
        text: h.text,
        ...(hasVar && h.varName ? {
          example: {
            header_text_named_params: [{ param_name: h.varName, example: h.varExample ?? "" }],
          },
        } : {}),
      });
    } else if (h.format === "LOCATION") {
      out.push({ type: "HEADER", format: "LOCATION" });
    } else if (h.handle && ["IMAGE", "VIDEO", "DOCUMENT"].includes(h.format)) {
      out.push({ type: "HEADER", format: h.format, example: { header_handle: [h.handle] } });
    }
  }

  // Body (required)
  const bodyText = comp.body.text ?? "";
  const varNames = extractVarNames(bodyText);
  const examples = comp.body.examples ?? {};
  out.push({
    type: "BODY",
    text: bodyText,
    ...(varNames.length > 0 ? {
      example: {
        body_text_named_params: varNames.map((name) => ({
          param_name: name,
          example: examples[name] ?? "",
        })),
      },
    } : {}),
  });

  // Footer
  if (comp.footer?.text) {
    out.push({ type: "FOOTER", text: comp.footer.text });
  }

  // Buttons
  if (comp.buttons?.length) {
    const buttons = comp.buttons.flatMap((b: WaButton) => {
      if (b.type === "QUICK_REPLY") return [{ type: "QUICK_REPLY", text: b.text }];
      if (b.type === "PHONE_NUMBER") return [{ type: "PHONE_NUMBER", text: b.text, phone_number: b.phoneNumber }];
      if (b.type === "URL") {
        const hasVar = b.url?.includes("{{1}}");
        return [{
          type: "URL",
          text: b.text,
          url: b.url,
          ...(hasVar && b.urlExample ? { example: [b.urlExample] } : {}),
        }];
      }
      return [];
    });
    if (buttons.length > 0) out.push({ type: "BUTTONS", buttons });
  }

  return out;
}

/** Build the payload for AUTHENTICATION templates (upsert endpoint). */
function buildAuthPayload(metaTemplateName: string, language: string, comp: WaComponents): unknown {
  const components: unknown[] = [
    { type: "BODY", add_security_recommendation: comp.body.addSecurityRecommendation ?? false },
  ];
  if (comp.footer?.codeExpirationMinutes) {
    components.push({ type: "FOOTER", code_expiration_minutes: comp.footer.codeExpirationMinutes });
  }
  if (comp.buttons?.length) {
    const btn = comp.buttons[0];
    if (btn && btn.type === "OTP") {
      const buttonDef: Record<string, unknown> = { type: "OTP", otp_type: btn.otpType ?? "COPY_CODE" };
      if (btn.otpType === "ONE_TAP" && btn.packageName) {
        buttonDef["supported_apps"] = [{ package_name: btn.packageName, signature_hash: btn.signatureHash ?? "" }];
      }
      components.push({ type: "BUTTONS", buttons: [buttonDef] });
    }
  }
  return { name: metaTemplateName, languages: [language], category: "AUTHENTICATION", components };
}

// POST /v1/templates
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
    const { channel, name, variables, whatsappCategory, whatsappLanguage, components, parameterFormat } = parsed.data;
    let { body } = parsed.data;

    // Derive body from components.body.text for WhatsApp templates when body not provided.
    if (channel === "whatsapp" && !body && components) {
      const comp = components as WaComponents;
      body = comp.body?.text ?? "";
    }

    const [created] = await db
      .insert(templates)
      .values({
        tenantId,
        channel,
        name,
        body,
        variables,
        whatsappStatus: null, // null = not submitted yet
        whatsappCategory: whatsappCategory ?? null,
        whatsappLanguage: whatsappLanguage ?? "en",
        components: components ?? null,
        parameterFormat: parameterFormat ?? "named",
      })
      .returning(SAFE_COLUMNS);

    res.status(201).json(created);
  }),
);

// GET /v1/templates
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

// GET /v1/templates/:id
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

// PATCH /v1/templates/:id
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

    // Keep body in sync with components.body.text when components is updated.
    const updates: Record<string, unknown> = { ...parsed.data };
    if (updates.components && !updates.body) {
      const comp = updates.components as WaComponents;
      updates.body = comp.body?.text ?? "";
    }

    const [updated] = await db
      .update(templates)
      .set(updates)
      .where(and(eq(templates.id, req.params.id ?? ""), eq(templates.tenantId, tenantId)))
      .returning(SAFE_COLUMNS);

    if (!updated) { res.status(404).json({ error: "Template not found" }); return; }
    res.json(updated);
  }),
);

// DELETE /v1/templates/:id
templatesRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const tenantId = req.tenantId;
    if (!tenantId) { res.status(401).json({ error: "Unauthenticated" }); return; }

    const [row] = await db
      .select({ id: templates.id, metaTemplateId: templates.metaTemplateId, metaTemplateName: templates.metaTemplateName })
      .from(templates)
      .where(and(eq(templates.id, req.params.id ?? ""), eq(templates.tenantId, tenantId)))
      .limit(1);

    if (!row) { res.status(404).json({ error: "Template not found" }); return; }

    await db
      .delete(templates)
      .where(and(eq(templates.id, req.params.id ?? ""), eq(templates.tenantId, tenantId)));

    res.status(204).send();
  }),
);

// POST /v1/templates/:id/submit-whatsapp
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
      .select({
        ...SAFE_COLUMNS,
        body: templates.body,
        components: templates.components,
        whatsappCategory: templates.whatsappCategory,
      })
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

    // Derive the Meta template name: lowercase alphanumeric + underscores.
    const metaTemplateName = template.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");

    const comp = template.components as WaComponents | null;
    const isAuth = category === "AUTHENTICATION";

    let endpoint: string;
    let payload: unknown;

    if (isAuth) {
      // Authentication templates use a separate upsert endpoint and are auto-approved.
      endpoint = `${GRAPH_URL}/${wabaId}/upsert_message_templates`;
      payload = comp
        ? buildAuthPayload(metaTemplateName, language, comp)
        : { name: metaTemplateName, languages: [language], category: "AUTHENTICATION", components: [{ type: "BODY", add_security_recommendation: false }] };
    } else {
      // MARKETING/UTILITY: use named-param format with examples.
      endpoint = `${GRAPH_URL}/${wabaId}/message_templates`;
      if (comp) {
        payload = {
          name: metaTemplateName,
          language,
          category,
          // parameter_format omitted — Meta infers named format from body_text_named_params
          components: buildMetaComponents(comp),
        };
      } else {
        // Legacy fallback: body-only with named params and placeholder examples.
        const bodyText = template.body ?? "";
        const varNames = extractVarNames(bodyText);
        payload = {
          name: metaTemplateName,
          language,
          category,
          components: [{
            type: "BODY",
            text: bodyText,
            ...(varNames.length > 0 ? {
              example: {
                body_text_named_params: varNames.map((name, i) => ({ param_name: name, example: `example_${i + 1}` })),
              },
            } : {}),
          }],
        };
      }
    }

    const metaRes = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    });

    if (!metaRes.ok) {
      const err = (await metaRes.json().catch(() => ({}))) as { error?: { message?: string } };
      res.status(metaRes.status).json({
        error: `Meta rejected template: ${err.error?.message ?? metaRes.statusText}`,
      });
      return;
    }

    // Auth templates: response is an array of { id, status, language }
    // Standard templates: response is { id, status, category }
    const metaData = (await metaRes.json()) as { id?: string; status?: string; data?: Array<{ id?: string; status?: string }> };
    const metaId = metaData.id ?? metaData.data?.[0]?.id ?? null;
    const metaStatus = (metaData.status ?? metaData.data?.[0]?.status ?? "").toUpperCase();

    // Auth templates come back APPROVED immediately; others are PENDING.
    const newStatus = metaStatus === "APPROVED" ? "approved" : "pending";

    const [updated] = await db
      .update(templates)
      .set({
        whatsappStatus: newStatus,
        metaTemplateName,
        metaTemplateId: metaId,
        whatsappCategory: category,
        whatsappLanguage: language,
      })
      .where(and(eq(templates.id, req.params.id ?? ""), eq(templates.tenantId, tenantId)))
      .returning(SAFE_COLUMNS);

    res.json(updated);
  }),
);

// POST /v1/templates/:id/sync-whatsapp — pull current status from Meta Graph API
templatesRouter.post(
  "/:id/sync-whatsapp",
  asyncHandler(async (req, res) => {
    const tenantId = req.tenantId;
    if (!tenantId) { res.status(401).json({ error: "Unauthenticated" }); return; }

    const [template] = await db
      .select({ id: templates.id, metaTemplateName: templates.metaTemplateName })
      .from(templates)
      .where(and(eq(templates.id, req.params.id ?? ""), eq(templates.tenantId, tenantId)))
      .limit(1);
    if (!template) { res.status(404).json({ error: "Template not found" }); return; }
    if (!template.metaTemplateName) { res.status(422).json({ error: "Template has not been submitted to Meta yet" }); return; }

    const [cred] = await db
      .select({ secretRef: providerCredentials.secretRef, config: providerCredentials.config })
      .from(providerCredentials)
      .where(and(eq(providerCredentials.tenantId, tenantId), eq(providerCredentials.channel, "whatsapp"), eq(providerCredentials.provider, "meta_cloud_api")))
      .limit(1);
    if (!cred) { res.status(422).json({ error: "No Meta Cloud API credential configured" }); return; }

    const wabaId = typeof cred.config?.wabaId === "string" ? cred.config.wabaId : "";
    if (!wabaId) { res.status(422).json({ error: "Meta credential missing wabaId" }); return; }

    const secret = await vault.resolveSecret(cred.secretRef, tenantId);
    const token = secret.reveal();

    const metaRes = await fetch(
      `${GRAPH_URL}/${wabaId}/message_templates?name=${encodeURIComponent(template.metaTemplateName)}&fields=id,name,status,category,rejected_reason`,
      { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) },
    );
    if (!metaRes.ok) {
      const err = (await metaRes.json().catch(() => ({}))) as { error?: { message?: string } };
      res.status(metaRes.status).json({ error: `Meta API error: ${err.error?.message ?? metaRes.statusText}` });
      return;
    }

    const data = (await metaRes.json()) as { data?: Array<{ id?: string; status?: string; category?: string; rejected_reason?: string }> };
    const match = data.data?.[0];
    if (!match) { res.status(404).json({ error: "Template not found on Meta" }); return; }

    const rawStatus = (match.status ?? "").toUpperCase();
    const newStatus: "approved" | "rejected" | "pending" | null =
      rawStatus === "APPROVED" || rawStatus === "ACTIVE" ? "approved"
      : rawStatus === "REJECTED" || rawStatus === "DISABLED" ? "rejected"
      : rawStatus === "PENDING" || rawStatus === "IN_REVIEW" ? "pending"
      : null;

    const [updated] = await db
      .update(templates)
      .set({
        ...(newStatus ? { whatsappStatus: newStatus } : {}),
        ...(match.category ? { whatsappCategory: match.category } : {}),
        ...(match.rejected_reason ? { whatsappRejectionReason: match.rejected_reason } : {}),
      })
      .where(and(eq(templates.id, template.id), eq(templates.tenantId, tenantId)))
      .returning(SAFE_COLUMNS);

    res.json(updated);
  }),
);
