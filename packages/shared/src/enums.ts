import { z } from "zod";

/**
 * Canonical enum values for Qalisa. This file is the single source of truth:
 * the DB layer builds Postgres enums from these arrays, and request validation
 * builds Zod enums from them. Add a value here and both sides stay in sync.
 */

export const TENANT_STATUSES = ["setup", "active", "suspended"] as const;
export const tenantStatusSchema = z.enum(TENANT_STATUSES);
export type TenantStatus = (typeof TENANT_STATUSES)[number];

export const ROLES = ["owner", "admin", "member"] as const;
export const roleSchema = z.enum(ROLES);
export type Role = (typeof ROLES)[number];

export const CHANNELS = ["email", "sms", "whatsapp"] as const;
export const channelSchema = z.enum(CHANNELS);
export type Channel = (typeof CHANNELS)[number];

export const PROVIDERS = ["mailgun", "mailjet", "smsportal", "meta_cloud_api"] as const;
export const providerSchema = z.enum(PROVIDERS);
export type Provider = (typeof PROVIDERS)[number];

export const CRED_STATUSES = ["unverified", "healthy", "failing"] as const;
export const credStatusSchema = z.enum(CRED_STATUSES);
export type CredStatus = (typeof CRED_STATUSES)[number];

export const WA_TEMPLATE_STATUSES = ["pending", "approved", "rejected"] as const;
export const waTemplateStatusSchema = z.enum(WA_TEMPLATE_STATUSES);
export type WaTemplateStatus = (typeof WA_TEMPLATE_STATUSES)[number];

export const CONSENT_STATES = ["granted", "withdrawn"] as const;
export const consentStateSchema = z.enum(CONSENT_STATES);
export type ConsentState = (typeof CONSENT_STATES)[number];

export const SUPPRESSION_REASONS = ["optout", "bounce", "complaint", "manual"] as const;
export const suppressionReasonSchema = z.enum(SUPPRESSION_REASONS);
export type SuppressionReason = (typeof SUPPRESSION_REASONS)[number];

export const MESSAGE_STATUSES = ["queued", "sent", "delivered", "read", "failed"] as const;
export const messageStatusSchema = z.enum(MESSAGE_STATUSES);
export type MessageStatus = (typeof MESSAGE_STATUSES)[number];

/** Which providers are valid for a given channel. */
export const PROVIDERS_BY_CHANNEL = {
  email: ["mailgun", "mailjet"],
  sms: ["smsportal"],
  whatsapp: ["meta_cloud_api"],
} as const satisfies Record<Channel, readonly Provider[]>;
