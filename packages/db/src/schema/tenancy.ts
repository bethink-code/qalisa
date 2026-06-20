import { pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { roleEnum, tenantStatusEnum } from "./enums";

/**
 * Tenants. Bethink is a row here like any other — NO flag distinguishes it.
 * (See brief §1: no special-casing of tenant zero.)
 */
export const tenants = pgTable("tenants", {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  status: tenantStatusEnum().notNull().default("setup"),
  planId: uuid(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable(
  "users",
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    email: text().notNull(),
    role: roleEnum().notNull().default("member"),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.tenantId, t.email)],
);

/** Engine-consumer API keys. Only the hash is stored — never the raw key. */
export const apiKeys = pgTable("api_keys", {
  id: uuid().primaryKey().defaultRandom(),
  tenantId: uuid()
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  keyHash: text().notNull().unique(),
  label: text().notNull(),
  scopes: text().array().notNull().default([]),
  lastUsedAt: timestamp({ withTimezone: true }),
  revokedAt: timestamp({ withTimezone: true }),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});
