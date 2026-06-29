import { Secret } from "@qalisa/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { smsportalAdapter } from "./smsportal";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const config = { clientId: "test-client-id" };
const secret = new Secret("test-client-secret");
const creds = { config, secret };

const authSuccess = {
  ok: true,
  status: 200,
  json: async () => ({ token: "jwt-token-abc" }),
};

beforeEach(() => mockFetch.mockReset());
afterEach(() => vi.restoreAllMocks());

describe("validateCredentials", () => {
  it("returns ok when auth succeeds", async () => {
    mockFetch.mockResolvedValue(authSuccess);
    const result = await smsportalAdapter.validateCredentials(config, secret);
    expect(result.ok).toBe(true);
    expect(result.detail).toContain("authenticated");
  });

  it("returns not-ok for 401", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 401 });
    const result = await smsportalAdapter.validateCredentials(config, secret);
    expect(result.ok).toBe(false);
    expect(result.detail).toContain("invalid");
  });

  it("returns not-ok for network errors", async () => {
    mockFetch.mockRejectedValue(new Error("ECONNREFUSED"));
    const result = await smsportalAdapter.validateCredentials(config, secret);
    expect(result.ok).toBe(false);
    expect(result.detail).toContain("network error");
  });

  it("returns not-ok when clientId is missing", async () => {
    const result = await smsportalAdapter.validateCredentials({}, secret);
    expect(result.ok).toBe(false);
    expect(result.detail).toContain("missing 'clientId'");
  });
});

describe("send", () => {
  const sendSuccess = {
    ok: true,
    json: async () => ({
      errors: [],
      messages: [{ messageId: "sms-portal-msg-id-123" }],
    }),
  };

  it("authenticates then sends, returning providerMessageId", async () => {
    mockFetch.mockResolvedValueOnce(authSuccess).mockResolvedValueOnce(sendSuccess);
    const result = await smsportalAdapter.send(
      { channel: "sms", to: "+27821234567", body: "Hello!" },
      creds,
    );
    expect(result.providerMessageId).toBe("sms-portal-msg-id-123");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("sends correct destination and content", async () => {
    mockFetch.mockResolvedValueOnce(authSuccess).mockResolvedValueOnce(sendSuccess);
    await smsportalAdapter.send(
      { channel: "sms", to: "+27821234567", body: "Test message" },
      creds,
    );
    const sendCall = mockFetch.mock.calls[1];
    const body = JSON.parse(sendCall![1]!.body as string) as {
      messages: { destination: string; content: string }[];
    };
    expect(body.messages[0]!.destination).toBe("27821234567");
    expect(body.messages[0]!.content).toBe("Test message");
  });

  it("throws when auth fails", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401 });
    await expect(
      smsportalAdapter.send({ channel: "sms", to: "+27821234567", body: "Hi" }, creds),
    ).rejects.toThrow("invalid SMSPortal credentials");
  });

  it("throws when send returns non-ok", async () => {
    mockFetch
      .mockResolvedValueOnce(authSuccess)
      .mockResolvedValueOnce({ ok: false, status: 400, text: async () => "bad request" });
    await expect(
      smsportalAdapter.send({ channel: "sms", to: "+27821234567", body: "Hi" }, creds),
    ).rejects.toThrow("SMSPortal send failed (400)");
  });

  it("throws when errors array is non-empty", async () => {
    mockFetch.mockResolvedValueOnce(authSuccess).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ errors: [{ error: "invalid destination" }], messages: [] }),
    });
    await expect(
      smsportalAdapter.send({ channel: "sms", to: "bad-number", body: "Hi" }, creds),
    ).rejects.toThrow("rejected message");
  });
});

describe("parseWebhook", () => {
  it("parses a delivered event", async () => {
    const body = {
      eventId: "evt-1",
      messages: [{ messageId: "msg-123", status: "DELIVERED" }],
    };
    const events = await smsportalAdapter.parseWebhook(
      { headers: {}, body },
      { config: {}, secret },
    );
    expect(events).toHaveLength(1);
    expect(events[0]!.status).toBe("delivered");
    expect(events[0]!.providerMessageId).toBe("msg-123");
  });

  it("parses a failed event", async () => {
    const body = { messages: [{ messageId: "msg-456", status: "FAILED" }] };
    const events = await smsportalAdapter.parseWebhook(
      { headers: {}, body },
      { config: {}, secret },
    );
    expect(events[0]!.status).toBe("failed");
  });

  it("maps UNDELIVERED, EXPIRED, REJECTED to failed", async () => {
    for (const status of ["UNDELIVERED", "EXPIRED", "REJECTED"]) {
      const events = await smsportalAdapter.parseWebhook(
        { headers: {}, body: { messages: [{ messageId: "x", status }] } },
        { config: {}, secret },
      );
      expect(events[0]!.status).toBe("failed");
    }
  });

  it("maps SUBMITTED and SENT to sent", async () => {
    for (const status of ["SUBMITTED", "SENT"]) {
      const events = await smsportalAdapter.parseWebhook(
        { headers: {}, body: { messages: [{ messageId: "x", status }] } },
        { config: {}, secret },
      );
      expect(events[0]!.status).toBe("sent");
    }
  });

  it("skips unknown statuses", async () => {
    const body = { messages: [{ messageId: "msg-1", status: "PENDING_SOMETHING" }] };
    const events = await smsportalAdapter.parseWebhook(
      { headers: {}, body },
      { config: {}, secret },
    );
    expect(events).toHaveLength(0);
  });

  it("returns empty array when messages key is missing", async () => {
    const events = await smsportalAdapter.parseWebhook(
      { headers: {}, body: { eventId: "x" } },
      { config: {}, secret },
    );
    expect(events).toHaveLength(0);
  });

  it("handles multiple messages in one callback", async () => {
    const body = {
      messages: [
        { messageId: "a", status: "DELIVERED" },
        { messageId: "b", status: "FAILED" },
        { messageId: "c", status: "PENDING_UNKNOWN" },
      ],
    };
    const events = await smsportalAdapter.parseWebhook(
      { headers: {}, body },
      { config: {}, secret },
    );
    expect(events).toHaveLength(2);
    expect(events[0]!.status).toBe("delivered");
    expect(events[1]!.status).toBe("failed");
  });
});
