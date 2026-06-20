import { z } from "zod";
import { channelSchema } from "./enums";

/**
 * Payload for POST /v1/messages — a single transactional/triggered send.
 * Either a templateId or an inline body must be supplied.
 */
export const sendMessageSchema = z
  .object({
    channel: channelSchema,
    to: z.string().min(1, "recipient is required"),
    templateId: z.string().optional(),
    body: z.string().optional(),
    variables: z.record(z.string()).optional(),
  })
  .refine((d) => Boolean(d.templateId) || Boolean(d.body), {
    message: "Either templateId or body is required",
    path: ["templateId"],
  });

export type SendMessageInput = z.infer<typeof sendMessageSchema>;
