/**
 * Source of the vault master key (the KEK that wraps per-secret data keys).
 * Self-hosted v1 reads it from env; a KMS-backed provider can implement this
 * same interface later without touching the vault.
 */
export interface KeyProvider {
  getMasterKey(): Promise<Uint8Array>;
}

const MASTER_KEY_BYTES = 32; // crypto_secretbox key length

/** Reads the base64-encoded 32-byte master key from configuration. */
export class EnvKeyProvider implements KeyProvider {
  #key: Uint8Array | null = null;

  constructor(private readonly base64Key: string) {}

  async getMasterKey(): Promise<Uint8Array> {
    if (this.#key) {
      return this.#key;
    }
    const buf = Buffer.from(this.base64Key, "base64");
    if (buf.length !== MASTER_KEY_BYTES) {
      throw new Error(
        `VAULT_MASTER_KEY must decode to ${MASTER_KEY_BYTES} bytes, got ${buf.length}. ` +
          "Generate one with: openssl rand -base64 32",
      );
    }
    this.#key = new Uint8Array(buf);
    return this.#key;
  }
}
