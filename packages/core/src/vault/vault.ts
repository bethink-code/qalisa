import type { Db } from "@qalisa/db";
import { secrets } from "@qalisa/db/schema";
import { Secret } from "@qalisa/shared";
import { and, eq } from "drizzle-orm";
import { decryptSecret, encryptSecret } from "./envelope";
import type { KeyProvider } from "./keyProvider";

/**
 * The credential vault. Encrypts secrets into the `secrets` table and resolves
 * them back. Every read/delete is tenant-scoped — a secretRef alone is never
 * enough; the caller's tenantId must match (last line of defence against
 * cross-tenant leakage).
 */
export class Vault {
  constructor(
    private readonly db: Db,
    private readonly keys: KeyProvider,
  ) {}

  /** Encrypt and persist a secret; returns its secretRef (the `secrets` row id). */
  async storeSecret(tenantId: string, plaintext: string): Promise<string> {
    const masterKey = await this.keys.getMasterKey();
    const ciphertext = encryptSecret(plaintext, masterKey);
    const [row] = await this.db
      .insert(secrets)
      .values({ tenantId, ciphertext })
      .returning({ id: secrets.id });
    if (!row) {
      throw new Error("Failed to persist secret");
    }
    return row.id;
  }

  /** Resolve a secret for the owning tenant. Wrong tenant => "not found". */
  async resolveSecret(secretRef: string, tenantId: string): Promise<Secret> {
    const [row] = await this.db
      .select({ ciphertext: secrets.ciphertext })
      .from(secrets)
      .where(and(eq(secrets.id, secretRef), eq(secrets.tenantId, tenantId)))
      .limit(1);
    if (!row) {
      throw new Error("Secret not found");
    }
    const masterKey = await this.keys.getMasterKey();
    return new Secret(decryptSecret(row.ciphertext, masterKey));
  }

  /** Delete a secret (tenant-scoped). Used when a credential is replaced/removed. */
  async deleteSecret(secretRef: string, tenantId: string): Promise<void> {
    await this.db
      .delete(secrets)
      .where(and(eq(secrets.id, secretRef), eq(secrets.tenantId, tenantId)));
  }
}
