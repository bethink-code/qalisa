import { prepareMessage } from "@qalisa/core";
import { db, messages } from "@qalisa/db";
import { channelSchema } from "@qalisa/shared";
import { desc, eq } from "drizzle-orm";
import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/asyncHandler";
import { requireScope } from "../middleware/requireScope";
import { sendQueue } from "../queue";

export const messagesRouter: Router = Router();

const sendRequestSchema = z
  .object({
    channel: channelSchema,
    to: z.string().min(1, "recipient is required"),
    subject: z.string().optional(),
    templateId: z.string().optional(),
    body: z.string().optional(),
    variables: z.record(z.string()).optional(),
    idempotencyKey: z.string().optional(),
  })
  .refine((d) => Boolean(d.templateId) || Boolean(d.body), {
    message: "Either templateId or body is required",
    path: ["templateId"],
  });

// POST /v1/messages — validate, pre-check, then enqueue for async delivery.
// Returns 202 Accepted with { messageId, status: "queued" }.
messagesRouter.post(
  "/",
  requireScope("messages:send"),
  asyncHandler(async (req, res) => {
    const tenantId = req.tenantId;
    if (!tenantId) { res.status(401).json({ error: "Unauthenticated" }); return; }

    const parsed = sendRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input", issues: parsed.error.issues });
      return;
    }

    const rateLimitPerMinute = process.env.RATE_LIMIT_PER_TENANT_PER_MINUTE
      ? parseInt(process.env.RATE_LIMIT_PER_TENANT_PER_MINUTE, 10)
      : undefined;

    try {
      const prep = await prepareMessage(tenantId, parsed.data, { db, rateLimitPerMinute });

      if (prep.status === "failed") {
        res.status(200).json({ messageId: prep.messageId, status: "failed", error: prep.error });
        return;
      }

      // Idempotency hit — return the real status of the existing message.
      if (!prep.credentialId) {
        res.status(200).json({ messageId: prep.messageId, status: prep.existingStatus ?? "queued" });
        return;
      }

      await sendQueue.add("send", { tenantId, ...prep });

      res.status(202).json({ messageId: prep.messageId, status: "queued" });
    } catch (err) {
      const statusCode = (err as { statusCode?: number }).statusCode ?? 500;
      const message = err instanceof Error ? err.message : "Internal error";
      res.status(statusCode).json({ error: message });
    }
  }),
);

// GET /v1/messages — list the tenant's messages, most recent first.
messagesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const tenantId = req.tenantId;
    if (!tenantId) { res.status(401).json({ error: "Unauthenticated" }); return; }

    const rows = await db
      .select({
        id: messages.id,
        channel: messages.channel,
        provider: messages.provider,
        to: messages.to,
        body: messages.body,
        status: messages.status,
        providerMessageId: messages.providerMessageId,
        error: messages.error,
        createdAt: messages.createdAt,
        sentAt: messages.sentAt,
        deliveredAt: messages.deliveredAt,
      })
      .from(messages)
      .where(eq(messages.tenantId, tenantId))
      .orderBy(desc(messages.createdAt))
      .limit(200);

    res.json(rows);
  }),
);
