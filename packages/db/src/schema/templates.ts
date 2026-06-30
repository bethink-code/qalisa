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
  body: text().notNull().default(""),
  variables: jsonb().$type<Record<string, unknown>>().notNull().default({}),
  // WhatsApp metadata
  whatsappStatus: waTemplateStatusEnum(),
  metaTemplateName: text(),
  metaTemplateId: text(),       // Meta's returned template ID (for edit/delete by ID)
  whatsappCategory: text(),
  whatsappLanguage: text().default("en"),
  whatsappRejectionReason: text(),
  // Full component structure (WhatsApp only, new-style templates)
  components: jsonb().$type<unknown>(),
  parameterFormat: text().default("named"), // 'named' | 'positional'
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});
