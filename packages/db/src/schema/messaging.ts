import { pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { channelEnum, messageStatusEnum, providerEnum } from "./enums";
import { templates } from "./templates";
import { tenants } from "./tenancy";

/** Every individual send. Unique on (tenantId, idempotencyKey) guards retries. */
export const messages = pgTable(
  "messages",
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    channel: channelEnum().notNull(),
    provider: providerEnum().notNull(),
    to: text().notNull(),
    templateId: uuid().references(() => templates.id),
    status: messageStatusEnum().notNull().default("queued"),
    providerMessageId: text(),
    idempotencyKey: text(),
    error: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp({ withTimezone: true }),
    deliveredAt: timestamp({ withTimezone: true }),
  },
  (t) => [unique().on(t.tenantId, t.idempotencyKey)],
);

/** Append-only usage ledger — aggregated for rate-limits + billing. */
export const usageEvents = pgTable("usage_events", {
  id: uuid().primaryKey().defaultRandom(),
  tenantId: uuid()
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  channel: channelEnum().notNull(),
  messageId: uuid()
    .notNull()
    .references(() => messages.id, { onDelete: "cascade" }),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});
