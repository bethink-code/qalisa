import { db, templates } from "@qalisa/db";
import { createTemplateSchema, updateTemplateSchema } from "@qalisa/shared";
import { and, eq } from "drizzle-orm";
import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler";

export const templatesRouter: Router = Router();

/** Fields safe to return — tenantId is never exposed. */
const SAFE_COLUMNS = {
  id: templates.id,
  channel: templates.channel,
  name: templates.name,
  body: templates.body,
  variables: templates.variables,
  whatsappStatus: templates.whatsappStatus,
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
