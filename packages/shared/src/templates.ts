import { z } from "zod";
import { channelSchema } from "./enums";

export const createTemplateSchema = z.object({
  channel: channelSchema,
  name: z.string().min(1, "name is required"),
  body: z.string().min(1, "body is required"),
  /** Variable names referenced in the body ({{variable}} syntax), with optional descriptions. */
  variables: z.record(z.string()).optional().default({}),
});

export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;

export const updateTemplateSchema = z.object({
  name: z.string().min(1).optional(),
  body: z.string().min(1).optional(),
  variables: z.record(z.string()).optional(),
});

export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>;
