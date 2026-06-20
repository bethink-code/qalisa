import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "./envelope";

const masterKey = () => new Uint8Array(randomBytes(32));

describe("envelope encryption", () => {
  it("round-trips a secret", () => {
    const key = masterKey();
    const plaintext = "mailgun-api-key-abc123";
    expect(decryptSecret(encryptSecret(plaintext, key), key)).toBe(plaintext);
  });

  it("produces ciphertext that does not contain the plaintext", () => {
    const blob = encryptSecret("super-secret-token", masterKey());
    expect(blob).not.toContain("super-secret-token");
  });

  it("uses a fresh data key each time (different ciphertext for same input)", () => {
    const key = masterKey();
    expect(encryptSecret("same", key)).not.toBe(encryptSecret("same", key));
  });

  it("fails to decrypt with the wrong master key", () => {
    const blob = encryptSecret("secret", masterKey());
    expect(() => decryptSecret(blob, masterKey())).toThrow();
  });

  it("fails to decrypt tampered ciphertext", () => {
    const key = masterKey();
    const blob = JSON.parse(encryptSecret("secret", key));
    blob.ciphertext = Buffer.from("tampered").toString("base64");
    expect(() => decryptSecret(JSON.stringify(blob), key)).toThrow();
  });
});
