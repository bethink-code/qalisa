/**
 * Vault master-key rotation script.
 *
 * Decrypts all secrets under OLD_MASTER_KEY and re-encrypts under NEW_MASTER_KEY.
 * Runs in a single transaction — all-or-nothing. Safe to re-run after a failure.
 *
 * Usage:
 *   OLD_MASTER_KEY=<64-hex-chars> NEW_MASTER_KEY=<64-hex-chars> \
 *     npx tsx apps/engine/scripts/rotate-vault-key.ts
 *
 * After a successful run, update VAULT_MASTER_KEY in your environment (Railway
 * Variables) to NEW_MASTER_KEY and redeploy. Do not delete OLD_MASTER_KEY until
 * the deploy is live and healthy.
 */
import { decryptSecret, encryptSecret } from "@qalisa/core";
import { db } from "@qalisa/db";
import { secrets } from "@qalisa/db/schema";
import { eq } from "drizzle-orm";

async function main() {
  const oldHex = process.env.OLD_MASTER_KEY;
  const newHex = process.env.NEW_MASTER_KEY;

  if (!oldHex || !newHex) {
    console.error("OLD_MASTER_KEY and NEW_MASTER_KEY must both be set");
    process.exit(1);
  }
  if (oldHex === newHex) {
    console.error("OLD_MASTER_KEY and NEW_MASTER_KEY are identical — nothing to rotate");
    process.exit(1);
  }

  const oldKey = Buffer.from(oldHex, "hex");
  const newKey = Buffer.from(newHex, "hex");
  if (oldKey.length !== 32 || newKey.length !== 32) {
    console.error("Keys must be 32 bytes (64 hex characters) for AES-256");
    process.exit(1);
  }

  const rows = await db.select({ id: secrets.id, ciphertext: secrets.ciphertext }).from(secrets);
  console.log(`Rotating ${rows.length} secret(s)...`);

  await db.transaction(async (tx) => {
    for (const row of rows) {
      const plaintext = decryptSecret(row.ciphertext, oldKey);
      const newCiphertext = encryptSecret(plaintext, newKey);
      await tx.update(secrets).set({ ciphertext: newCiphertext }).where(eq(secrets.id, row.id));
    }
  });

  console.log(`Done. ${rows.length} secret(s) re-encrypted.`);
  console.log("Next: update VAULT_MASTER_KEY in Railway Variables to the new key and redeploy.");
}

main().catch((err: unknown) => {
  console.error("Rotation failed:", err);
  process.exit(1);
});
