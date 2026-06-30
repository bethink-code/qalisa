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
  metaTemplateName: text(), // name submitted to Meta (lowercase_underscore)
  whatsappCategory: text(), // MARKETING | UTILITY | AUTHENTICATION
  whatsappLanguage: text().default("en"), // BCP-47 language code
  whatsappRejectionReason: text(), // populated when Meta rejects
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});
