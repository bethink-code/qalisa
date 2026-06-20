import { pgTable, primaryKey, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { channelEnum, consentStateEnum, suppressionReasonEnum } from "./enums";
import { tenants } from "./tenancy";

export const contacts = pgTable("contacts", {
  id: uuid().primaryKey().defaultRandom(),
  tenantId: uuid()
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  email: text(),
  msisdn: text(), // E.164
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const audiences = pgTable("audiences", {
  id: uuid().primaryKey().defaultRandom(),
  tenantId: uuid()
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  name: text().notNull(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const audienceMembers = pgTable(
  "audience_members",
  {
    audienceId: uuid()
      .notNull()
      .references(() => audiences.id, { onDelete: "cascade" }),
    contactId: uuid()
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.audienceId, t.contactId] })],
);

export const consentRecords = pgTable("consent_records", {
  id: uuid().primaryKey().defaultRandom(),
  contactId: uuid()
    .notNull()
    .references(() => contacts.id, { onDelete: "cascade" }),
  channel: channelEnum().notNull(),
  state: consentStateEnum().notNull(),
  source: text().notNull(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

/** Hard opt-outs / bounces / complaints — checked before EVERY send. */
export const suppressions = pgTable(
  "suppressions",
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    channel: channelEnum().notNull(),
    identifier: text().notNull(), // email or msisdn
    reason: suppressionReasonEnum().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.tenantId, t.channel, t.identifier)],
);
