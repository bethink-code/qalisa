import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { channelEnum, waTemplateStatusEnum } from "./enums";
import { tenants } from "./tenancy";

export const templates = pgTable("templates", {
  id: uuid().primaryKey().defaultRandom(),
  tenantId: uuid()
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  channel: channelEnum().notNull(),
  name: text().notNull(),
  body: text().notNull(),
  variables: jsonb().$type<Record<string, unknown>>().notNull().default({}),
  whatsappStatus: waTemplateStatusEnum(), // WhatsApp only
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});
