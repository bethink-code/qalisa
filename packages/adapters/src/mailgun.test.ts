import { Secret } from "@qalisa/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mailgunAdapter } from "./mailgun";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const config = { domain: "mg.example.com" };
const secret = new Secret("key-test123");
const creds = { config, secret };

beforeEach(() => mockFetch.mockReset());
afterEach(() => vi.restoreAllMocks());

describe("validateCredentials", () => {
  it("returns ok when domain exists", async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200 });
    const result = await mailgunAdapter.validateCredentials(config, secret);
    expect(result.ok).toBe(true);
    expect(result.detail).toContain("mg.example.com");
  });

  it("returns not-ok for 404", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 404 });
    const result = await mailgunAdapter.validateCredentials(config, secret);
    expect(result.ok).toBe(false);
    expect(result.detail).toContain("not found");
  });

  it("returns not-ok for 401", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 401 });
    const result = await mailgunAdapter.validateCredentials(config, secret);
    expect(result.ok).toBe(false);
    expect(result.detail).toContain("invalid API key");
  });

  it("returns not-ok for network errors", async () => {
    mockFetch.mockRejectedValue(new Error("ECONNREFUSED"));
    const result = await mailgunAdapter.validateCredentials(config, secret);
    expect(result.ok).toBe(false);
    expect(result.detail).toContain("network error");
  });

  it("returns not-ok when domain is missing from config", async () => {
    const result = await mailgunAdapter.validateCredentials({}, secret);
    expect(result.ok).toBe(false);
    expect(result.detail).toContain("missing 'domain'");
  });

  it("uses EU base URL when region is eu", async () => {
    mockFetch.mockResolvedValue({ ok: true });
    await mailgunAdapter.validateCredentials({ domain: "mg.example.com", region: "eu" }, secret);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("api.eu.mailgun.net"),
      expect.any(Object),
    );
  });
});

describe("send", () => {
  it("returns providerMessageId stripped of angle brackets", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ id: "<20240101.abc@mg.example.com>" }),
    });
    const result = await mailgunAdapter.send(
      { channel: "email", to: "user@example.com", body: "Hello", subject: "Hi" },
      creds,
    );
    expect(result.providerMessageId).toBe("20240101.abc@mg.example.com");
  });

  it("defaults from address to noreply@<domain>", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ id: "abc" }) });
    await mailgunAdapter.send({ channel: "email", to: "x@example.com", body: "Hi" }, creds);
    const body = new URLSearchParams(mockFetch.mock.calls[0]![1]!.body as string);
    expect(body.get("from")).toBe("noreply@mg.example.com");
  });

  it("uses fromAddress from config when provided", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ id: "abc" }) });
    await mailgunAdapter.send(
      { channel: "email", to: "x@example.com", body: "Hi" },
      { config: { domain: "mg.example.com", fromAddress: "Acme <hello@mg.example.com>" }, secret },
    );
    const body = new URLSearchParams(mockFetch.mock.calls[0]![1]!.body as string);
    expect(body.get("from")).toBe("Acme <hello@mg.example.com>");
  });

  it("throws on non-ok Mailgun response", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 400, text: async () => "bad request" });
    await expect(
      mailgunAdapter.send({ channel: "email", to: "x@example.com", body: "Hi" }, creds),
    ).rejects.toThrow("Mailgun send failed (400)");
  });

  it("throws on network error", async () => {
    mockFetch.mockRejectedValue(new Error("timeout"));
    await expect(
      mailgunAdapter.send({ channel: "email", to: "x@example.com", body: "Hi" }, creds),
    ).rejects.toThrow("Mailgun network error");
  });
});

describe("parseWebhook", () => {
  const deliveredBody = {
    signature: { timestamp: "1529006854", token: "validtoken", signature: "placeholder" },
    "event-data": {
      event: "delivered",
      message: { headers: { "message-id": "<20240101.abc@mg.example.com>" } },
    },
  };

  it("parses a delivered event without signature key (skips verification)", async () => {
    const events = await mailgunAdapter.parseWebhook(
      { headers: {}, body: deliveredBody },
      { config: {}, secret },
    );
    expect(events).toHaveLength(1);
    expect(events[0]!.status).toBe("delivered");
    expect(events[0]!.providerMessageId).toBe("20240101.abc@mg.example.com");
  });

  it("parses a failed event", async () => {
    const body = {
      ...deliveredBody,
      "event-data": { ...deliveredBody["event-data"], event: "failed" },
    };
    const events = await mailgunAdapter.parseWebhook({ headers: {}, body }, { config: {}, secret });
    expect(events[0]!.status).toBe("failed");
  });

  it("parses an accepted event as sent", async () => {
    const body = {
      ...deliveredBody,
      "event-data": { ...deliveredBody["event-data"], event: "accepted" },
    };
    const events = await mailgunAdapter.parseWebhook({ headers: {}, body }, { config: {}, secret });
    expect(events[0]!.status).toBe("sent");
  });

  it("returns empty array for unhandled event types", async () => {
    const body = {
      ...deliveredBody,
      "event-data": { ...deliveredBody["event-data"], event: "opened" },
    };
    const events = await mailgunAdapter.parseWebhook({ headers: {}, body }, { config: {}, secret });
    expect(events).toHaveLength(0);
  });

  it("returns empty array when event-data is missing", async () => {
    const events = await mailgunAdapter.parseWebhook(
      { headers: {}, body: { signature: {} } },
      { config: {}, secret },
    );
    expect(events).toHaveLength(0);
  });

  it("throws when signature is wrong", async () => {
    await expect(
      mailgunAdapter.parseWebhook(
        { headers: {}, body: deliveredBody },
        { config: { webhookSigningKey: "secret-key" }, secret },
      ),
    ).rejects.toThrow("signature verification failed");
  });

  it("passes when signature is correct", async () => {
    const { createHmac } = await import("node:crypto");
    const signingKey = "test-webhook-key";
    const timestamp = "1529006854";
    const token = "validtoken";
    const correctSig = createHmac("sha256", signingKey).update(timestamp + token).digest("hex");
    const body = {
      signature: { timestamp, token, signature: correctSig },
      "event-data": {
        event: "delivered",
        message: { headers: { "message-id": "<abc>" } },
      },
    };
    const events = await mailgunAdapter.parseWebhook(
      { headers: {}, body },
      { config: { webhookSigningKey: signingKey }, secret },
    );
    expect(events).toHaveLength(1);
  });
});
