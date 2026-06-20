import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { tenants } from "./tenancy";

/**
 * Encrypted credential store — the vault's backing table. Each row holds ONE
 * envelope-encrypted secret as an opaque ciphertext blob. ProviderCredential
 * .secretRef points here by id. Plaintext NEVER lands in this table; selecting
 * a credential never returns secret material.
 */
export const secrets = pgTable("secrets", {
  id: uuid().primaryKey().defaultRandom(),
  tenantId: uuid()
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  ciphertext: text().notNull(), // serialized envelope blob (see packages/core vault)
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});
