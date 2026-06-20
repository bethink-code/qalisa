import { jsonb, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { channelEnum, credStatusEnum, providerEnum } from "./enums";
import { tenants } from "./tenancy";

/**
 * THE VAULT — one row per channel-provider per tenant. `secretRef` is a pointer
 * into the encrypted store; the secret itself is NEVER stored in this table.
 * `config` holds non-secret settings (Mailgun domain, WABA id, phone-number-id).
 */
export const providerCredentials = pgTable(
  "provider_credentials",
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    channel: channelEnum().notNull(),
    provider: providerEnum().notNull(),
    secretRef: text().notNull(),
    config: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    status: credStatusEnum().notNull().default("unverified"),
    lastHealthCheckAt: timestamp({ withTimezone: true }),
    tokenExpiresAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.tenantId, t.channel, t.provider)],
);
