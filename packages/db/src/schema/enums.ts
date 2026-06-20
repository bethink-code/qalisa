import { pgEnum } from "drizzle-orm/pg-core";
import {
  CHANNELS,
  CONSENT_STATES,
  CRED_STATUSES,
  MESSAGE_STATUSES,
  PROVIDERS,
  ROLES,
  SUPPRESSION_REASONS,
  TENANT_STATUSES,
  WA_TEMPLATE_STATUSES,
} from "@qalisa/shared";

// Postgres enums built from the shared canonical value arrays — see packages/shared/src/enums.ts.
export const tenantStatusEnum = pgEnum("tenant_status", TENANT_STATUSES);
export const roleEnum = pgEnum("role", ROLES);
export const channelEnum = pgEnum("channel", CHANNELS);
export const providerEnum = pgEnum("provider", PROVIDERS);
export const credStatusEnum = pgEnum("cred_status", CRED_STATUSES);
export const waTemplateStatusEnum = pgEnum("wa_template_status", WA_TEMPLATE_STATUSES);
export const consentStateEnum = pgEnum("consent_state", CONSENT_STATES);
export const suppressionReasonEnum = pgEnum("suppression_reason", SUPPRESSION_REASONS);
export const messageStatusEnum = pgEnum("message_status", MESSAGE_STATUSES);
