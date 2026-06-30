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

export const WA_CATEGORIES = ["MARKETING", "UTILITY", "AUTHENTICATION"] as const;
export type WaCategory = (typeof WA_CATEGORIES)[number];

export const submitWhatsappSchema = z.object({
  category: z.enum(WA_CATEGORIES),
  language: z.string().min(2).optional().default("en"),
});
