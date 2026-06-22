import { sendMessage } from "@qalisa/core";
import { db } from "@qalisa/db";
import { channelSchema } from "@qalisa/shared";
import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/asyncHandler";
import { vault } from "../services";

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

// POST /v1/messages — submit a message for immediate synchronous delivery.
messagesRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const tenantId = req.tenantId;
    if (!tenantId) {
      res.status(401).json({ error: "Unauthenticated" });
      return;
    }

    const parsed = sendRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input", issues: parsed.error.issues });
      return;
    }

    try {
      const result = await sendMessage(tenantId, parsed.data, { db, vault });
      res.status(201).json(result);
    } catch (err) {
      const statusCode = (err as { statusCode?: number }).statusCode ?? 500;
      const message = err instanceof Error ? err.message : "Internal error";
      res.status(statusCode).json({ error: message });
    }
  }),
);
