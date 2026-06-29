import { Secret } from "@qalisa/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mailjetAdapter } from "./mailjet";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const config = { apiKey: "test-api-key", fromAddress: "sender@example.com" };
const secret = new Secret("test-secret-key");
const creds = { config, secret };

beforeEach(() => mockFetch.mockReset());
afterEach(() => vi.restoreAllMocks());

describe("validateCredentials", () => {
  it("returns ok when sender list fetch succeeds", async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200 });
    const result = await mailjetAdapter.validateCredentials(config, secret);
    expect(result.ok).toBe(true);
    expect(result.detail).toContain("sender@example.com");
  });

  it("returns not-ok for 401", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 401 });
    const result = await mailjetAdapter.validateCredentials(config, secret);
    expect(result.ok).toBe(false);
    expect(result.detail).toContain("invalid API key");
  });

  it("returns not-ok for network errors", async () => {
    mockFetch.mockRejectedValue(new Error("ECONNREFUSED"));
    const result = await mailjetAdapter.validateCredentials(config, secret);
    expect(result.ok).toBe(false);
    expect(result.detail).toContain("network error");
  });

  it("returns not-ok when apiKey is missing from config", async () => {
    const result = await mailjetAdapter.validateCredentials({ fromAddress: "x@y.com" }, secret);
    expect(result.ok).toBe(false);
    expect(result.detail).toContain("missing 'apiKey'");
  });

  it("returns not-ok when fromAddress is missing from config", async () => {
    const result = await mailjetAdapter.validateCredentials({ apiKey: "key" }, secret);
    expect(result.ok).toBe(false);
    expect(result.detail).toContain("missing 'fromAddress'");
  });

  it("uses Basic auth with apiKey:secretKey", async () => {
    mockFetch.mockResolvedValue({ ok: true });
    await mailjetAdapter.validateCredentials(config, secret);
    const authHeader = mockFetch.mock.calls[0]![1]!.headers.Authorization as string;
    const decoded = Buffer.from(authHeader.replace("Basic ", ""), "base64").toString();
    expect(decoded).toBe("test-api-key:test-secret-key");
  });
});

describe("send", () => {
  const sendSuccess = {
    ok: true,
    json: async () => ({
      Messages: [{ Status: "success", To: [{ MessageID: 20547681647433000, MessageUUID: "abc-123" }] }],
    }),
  };

  it("returns providerMessageId from CustomID when messageId is provided", async () => {
    mockFetch.mockResolvedValue(sendSuccess);
    const result = await mailjetAdapter.send(
      { channel: "email", to: "user@example.com", body: "Hello", messageId: "our-uuid" },
      creds,
    );
    expect(result.providerMessageId).toBe("our-uuid");
  });

  it("falls back to Mailjet MessageID string when no messageId provided", async () => {
    mockFetch.mockResolvedValue(sendSuccess);
    const result = await mailjetAdapter.send(
      { channel: "email", to: "user@example.com", body: "Hello" },
      creds,
    );
    expect(result.providerMessageId).toBe("20547681647433000");
  });

  it("sends correct From, To, Subject, TextPart in request body", async () => {
    mockFetch.mockResolvedValue(sendSuccess);
    await mailjetAdapter.send(
      { channel: "email", to: "user@example.com", subject: "Hi", body: "Hello" },
      creds,
    );
    const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string) as {
      Messages: Array<{ From: { Email: string }; To: Array<{ Email: string }>; Subject: string; TextPart: string }>;
    };
    expect(body.Messages[0]!.From.Email).toBe("sender@example.com");
    expect(body.Messages[0]!.To[0]!.Email).toBe("user@example.com");
    expect(body.Messages[0]!.Subject).toBe("Hi");
    expect(body.Messages[0]!.TextPart).toBe("Hello");
  });

  it("includes CustomID in request when messageId is provided", async () => {
    mockFetch.mockResolvedValue(sendSuccess);
    await mailjetAdapter.send(
      { channel: "email", to: "user@example.com", body: "Hi", messageId: "our-uuid" },
      creds,
    );
    const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string) as {
      Messages: Array<{ CustomID?: string }>;
    };
    expect(body.Messages[0]!.CustomID).toBe("our-uuid");
  });

  it("throws when Mailjet returns Status: error", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        Messages: [{ Status: "error", Errors: [{ ErrorMessage: "sender not verified" }] }],
      }),
    });
    await expect(
      mailjetAdapter.send({ channel: "email", to: "user@example.com", body: "Hi" }, creds),
    ).rejects.toThrow("sender not verified");
  });

  it("throws on HTTP non-ok", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 400, text: async () => "bad request" });
    await expect(
      mailjetAdapter.send({ channel: "email", to: "user@example.com", body: "Hi" }, creds),
    ).rejects.toThrow("Mailjet send failed (400)");
  });

  it("throws on network error", async () => {
    mockFetch.mockRejectedValue(new Error("timeout"));
    await expect(
      mailjetAdapter.send({ channel: "email", to: "user@example.com", body: "Hi" }, creds),
    ).rejects.toThrow("Mailjet network error");
  });
});

describe("parseWebhook", () => {
  it("maps 'sent' event to delivered, using CustomID", async () => {
    const body = { event: "sent", CustomID: "our-uuid", MessageID: 456, email: "user@example.com" };
    const events = await mailjetAdapter.parseWebhook({ headers: {}, body }, { config: {}, secret });
    expect(events).toHaveLength(1);
    expect(events[0]!.status).toBe("delivered");
    expect(events[0]!.providerMessageId).toBe("our-uuid");
  });

  it("falls back to MessageID string when CustomID is absent", async () => {
    const body = { event: "sent", MessageID: 20547681647433000, email: "user@example.com" };
    const events = await mailjetAdapter.parseWebhook({ headers: {}, body }, { config: {}, secret });
    expect(events[0]!.providerMessageId).toBe("20547681647433000");
    expect(events[0]!.status).toBe("delivered");
  });

  it("maps 'bounce' to failed", async () => {
    const body = { event: "bounce", CustomID: "our-uuid", MessageID: 456, hard_bounce: true };
    const events = await mailjetAdapter.parseWebhook({ headers: {}, body }, { config: {}, secret });
    expect(events[0]!.status).toBe("failed");
  });

  it("maps 'blocked' to failed", async () => {
    const body = { event: "blocked", CustomID: "our-uuid", MessageID: 456 };
    const events = await mailjetAdapter.parseWebhook({ headers: {}, body }, { config: {}, secret });
    expect(events[0]!.status).toBe("failed");
  });

  it("skips open, click, spam, unsub events", async () => {
    for (const event of ["open", "click", "spam", "unsub"]) {
      const body = { event, CustomID: "our-uuid", MessageID: 456 };
      const events = await mailjetAdapter.parseWebhook({ headers: {}, body }, { config: {}, secret });
      expect(events).toHaveLength(0);
    }
  });

  it("returns empty array when both CustomID and MessageID are absent", async () => {
    const body = { event: "sent", email: "user@example.com" };
    const events = await mailjetAdapter.parseWebhook({ headers: {}, body }, { config: {}, secret });
    expect(events).toHaveLength(0);
  });

  it("returns empty array when event is missing", async () => {
    const body = { CustomID: "our-uuid", MessageID: 456 };
    const events = await mailjetAdapter.parseWebhook({ headers: {}, body }, { config: {}, secret });
    expect(events).toHaveLength(0);
  });
});
