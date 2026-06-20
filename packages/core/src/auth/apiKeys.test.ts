import { describe, expect, it } from "vitest";
import { generateApiKey, hashApiKey, safeEqual } from "./apiKeys";

describe("api keys", () => {
  it("generates a prefixed key and a matching hash", () => {
    const { raw, hash } = generateApiKey();
    expect(raw.startsWith("qal_")).toBe(true);
    expect(hashApiKey(raw)).toBe(hash);
  });

  it("produces unique keys", () => {
    const a = generateApiKey();
    const b = generateApiKey();
    expect(a.raw).not.toBe(b.raw);
    expect(a.hash).not.toBe(b.hash);
  });

  it("hash is deterministic and 64 hex chars (sha-256)", () => {
    const hash = hashApiKey("qal_fixed");
    expect(hash).toBe(hashApiKey("qal_fixed"));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("safeEqual compares correctly", () => {
    expect(safeEqual("token-abc", "token-abc")).toBe(true);
    expect(safeEqual("token-abc", "token-xyz")).toBe(false);
    expect(safeEqual("short", "longer-value")).toBe(false);
  });
});
