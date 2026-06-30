import { z } from "zod";
import { channelSchema } from "./enums";

export const WA_CATEGORIES = ["MARKETING", "UTILITY", "AUTHENTICATION"] as const;
export type WaCategory = (typeof WA_CATEGORIES)[number];

// ── Internal component structure stored in templates.components ──────────────

export interface WaButton {
  type: "QUICK_REPLY" | "URL" | "PHONE_NUMBER" | "OTP";
  text: string;
  /** URL button */
  url?: string;
  /** URL button — sample value for the {{1}} suffix variable, if used */
  urlExample?: string;
  /** PHONE_NUMBER button */
  phoneNumber?: string;
  /** OTP button (authentication templates only) */
  otpType?: "COPY_CODE" | "ONE_TAP" | "ZERO_TAP";
  /** ONE_TAP only — Android app package name */
  packageName?: string;
  /** ONE_TAP only — Android app signature hash */
  signatureHash?: string;
}

export interface WaHeader {
  format: "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT" | "LOCATION";
  /** TEXT format: header text (max 60 chars, supports 1 named variable) */
  text?: string;
  /** TEXT format: the {{varName}} used in text, if any */
  varName?: string;
  /** TEXT format: sample value for the variable */
  varExample?: string;
  /** media formats: asset handle from Resumable Upload API */
  handle?: string;
}

/**
 * Internal representation of a WhatsApp template's component structure.
 * Stored in templates.components (JSONB). Transformed to Meta API payload at submission time.
 */
export interface WaComponents {
  header?: WaHeader | null;
  body: {
    /** MARKETING/UTILITY: body text with {{var_name}} placeholders */
    text?: string;
    /** MARKETING/UTILITY: sample values per variable — varName → example */
    examples?: Record<string, string>;
    /** AUTHENTICATION only */
    addSecurityRecommendation?: boolean;
  };
  footer?: {
    /** MARKETING/UTILITY: footer text (max 60 chars, no variables) */
    text?: string;
    /** AUTHENTICATION only: code expiry in minutes (1–90) */
    codeExpirationMinutes?: number;
  } | null;
  buttons?: WaButton[] | null;
}

// ── Zod schemas ───────────────────────────────────────────────────────────────

export const createTemplateSchema = z.object({
  channel: channelSchema,
  /** Display name. For WhatsApp must be lowercase alphanumeric + underscores (^[a-z0-9_]+$). */
  name: z.string().min(1, "name is required"),
  /** Body text. For WhatsApp MARKETING/UTILITY this is the body component text.
   *  For AUTHENTICATION this is '' (body text is fixed by Meta).
   *  For SMS/email this is the full template text. */
  body: z.string().optional().default(""),
  variables: z.record(z.string()).optional().default({}),
  /** WhatsApp category (required for channel=whatsapp) */
  whatsappCategory: z.enum(WA_CATEGORIES).optional(),
  /** BCP-47 language code, e.g. "en_ZA" */
  whatsappLanguage: z.string().min(2).optional(),
  /** Full component structure — WaComponents. Required for channel=whatsapp. */
  components: z.unknown().optional(),
  /** 'named' (default) or 'positional'. New templates always use named. */
  parameterFormat: z.enum(["named", "positional"]).optional().default("named"),
});

export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;

export const updateTemplateSchema = z.object({
  name: z.string().min(1).optional(),
  body: z.string().optional(),
  variables: z.record(z.string()).optional(),
  whatsappCategory: z.enum(WA_CATEGORIES).optional(),
  whatsappLanguage: z.string().min(2).optional(),
  components: z.unknown().optional(),
});

export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>;

export const submitWhatsappSchema = z.object({
  category: z.enum(WA_CATEGORIES),
  language: z.string().min(2).optional().default("en"),
});
