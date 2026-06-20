import * as schema from "@qalisa/db/schema";
import { secrets, tenants } from "@qalisa/db/schema";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import { randomBytes } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { EnvKeyProvider } from "./keyProvider";
import { Vault } from "./vault";

/**
 * Proves tenant isolation against a REAL Postgres (no mocks). Set
 * TEST_DATABASE_URL to a migrated test database to run; otherwise skipped so CI
 * without a database still passes.
 */
const TEST_DB_URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!TEST_DB_URL)("Vault tenant isolation (integration)", () => {
  const client = postgres(TEST_DB_URL ?? "");
  const db = drizzle(client, { schema, casing: "snake_case" });
  const keyProvider = new EnvKeyProvider(randomBytes(32).toString("base64"));
  const vault = new Vault(db, keyProvider);
  const createdTenantIds: string[] = [];

  afterAll(async () => {
    for (const id of createdTenantIds) {
      await db.delete(tenants).where(eq(tenants.id, id));
    }
    await client.end();
  });

  async function makeTenant(name: string): Promise<string> {
    const [row] = await db.insert(tenants).values({ name }).returning({ id: tenants.id });
    if (!row) throw new Error("failed to create tenant");
    createdTenantIds.push(row.id);
    return row.id;
  }

  it("round-trips a secret for the owning tenant", async () => {
    const tenantId = await makeTenant("iso-owner");
    const ref = await vault.storeSecret(tenantId, "mg-key-123");
    const resolved = await vault.resolveSecret(ref, tenantId);
    expect(resolved.reveal()).toBe("mg-key-123");
  });

  it("does NOT resolve another tenant's secret (no cross-tenant leak)", async () => {
    const tenantA = await makeTenant("iso-a");
    const tenantB = await makeTenant("iso-b");
    const ref = await vault.storeSecret(tenantA, "tenant-a-secret");
    await expect(vault.resolveSecret(ref, tenantB)).rejects.toThrow("Secret not found");
  });

  it("stores ciphertext, not plaintext, in the secrets table", async () => {
    const tenantId = await makeTenant("iso-cipher");
    const ref = await vault.storeSecret(tenantId, "plaintext-needle");
    const [row] = await db
      .select({ ciphertext: secrets.ciphertext })
      .from(secrets)
      .where(eq(secrets.id, ref))
      .limit(1);
    expect(row?.ciphertext).toBeDefined();
    expect(row?.ciphertext).not.toContain("plaintext-needle");
  });
});
