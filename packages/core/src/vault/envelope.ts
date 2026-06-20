import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { z } from "zod";

/**
 * Envelope encryption with AES-256-GCM (node:crypto, no external deps).
 *
 *   1. A fresh random data key (DEK) encrypts the secret.
 *   2. The master key (KEK) encrypts the DEK.
 *
 * Only wrapped material is persisted, so rotating the KEK never requires
 * re-encrypting every secret's payload. GCM's auth tag means decryption throws
 * on any tampering or wrong key.
 */

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12; // GCM standard nonce length
const DEK_BYTES = 32; // AES-256 key length

interface Sealed {
  iv: Buffer;
  ciphertext: Buffer;
  tag: Buffer;
}

function seal(plaintext: Buffer, key: Buffer): Sealed {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return { iv, ciphertext, tag: cipher.getAuthTag() };
}

function open(sealed: Sealed, key: Buffer): Buffer {
  const decipher = createDecipheriv(ALGORITHM, key, sealed.iv);
  decipher.setAuthTag(sealed.tag);
  return Buffer.concat([decipher.update(sealed.ciphertext), decipher.final()]);
}

const envelopeBlobSchema = z.object({
  v: z.literal(1),
  wrappedDek: z.string(),
  dekIv: z.string(),
  dekTag: z.string(),
  iv: z.string(),
  ciphertext: z.string(),
  tag: z.string(),
});

export function encryptSecret(plaintext: string, masterKey: Uint8Array): string {
  const kek = Buffer.from(masterKey);
  const dek = randomBytes(DEK_BYTES);

  const data = seal(Buffer.from(plaintext, "utf8"), dek);
  const wrapped = seal(dek, kek);

  return JSON.stringify({
    v: 1,
    wrappedDek: wrapped.ciphertext.toString("base64"),
    dekIv: wrapped.iv.toString("base64"),
    dekTag: wrapped.tag.toString("base64"),
    iv: data.iv.toString("base64"),
    ciphertext: data.ciphertext.toString("base64"),
    tag: data.tag.toString("base64"),
  });
}

export function decryptSecret(serialized: string, masterKey: Uint8Array): string {
  const kek = Buffer.from(masterKey);
  const blob = envelopeBlobSchema.parse(JSON.parse(serialized));
  const b64 = (s: string) => Buffer.from(s, "base64");

  const dek = open(
    { ciphertext: b64(blob.wrappedDek), iv: b64(blob.dekIv), tag: b64(blob.dekTag) },
    kek,
  );
  const plaintext = open(
    { ciphertext: b64(blob.ciphertext), iv: b64(blob.iv), tag: b64(blob.tag) },
    dek,
  );
  return plaintext.toString("utf8");
}
