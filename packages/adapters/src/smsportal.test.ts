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
  // Mirrors the actual SMSPortal BulkMessages response shape observed in production.
  const sendSuccess = {
    ok: true,
    json: async () => ({
      cost: 1,
      remainingBalance: 589,
      eventId: 17291650560,
      sample: "Hello!",
      costBreakdown: [{ quantity: 1, cost: 1, network: "Local" }],
      messages: 1,
      parts: 1,
      errorReport: { noNetwork: 0, noContents: 0, contentTooLong: 0, duplicates: 0, optedOuts: 0, faults: [] },
    }),
  };

  it("authenticates then sends, returning providerMessageId", async () => {
    mockFetch.mockResolvedValueOnce(authSuccess).mockResolvedValueOnce(sendSuccess);
    const result = await smsportalAdapter.send(
      { channel: "sms", to: "+27821234567", body: "Hello!" },
      creds,
    );
    expect(result.providerMessageId).toBe("17291650560");
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

  it.each([
    ["+27831234567", "27831234567"],
    ["0831234567",   "27831234567"],
    ["27831234567",  "27831234567"],
    ["831234567",    "831234567"],
  ])("normalises %s → %s", async (input, expected) => {
    mockFetch.mockResolvedValueOnce(authSuccess).mockResolvedValueOnce(sendSuccess);
    await smsportalAdapter.send({ channel: "sms", to: input, body: "Hi" }, creds);
    const body = JSON.parse(mockFetch.mock.calls[1]![1]!.body as string) as {
      messages: { destination: string }[];
    };
    expect(body.messages[0]!.destination).toBe(expected);
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

  it("throws when errorReport.faults is non-empty", async () => {
    mockFetch.mockResolvedValueOnce(authSuccess).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        cost: 0, remainingBalance: 589, eventId: 0, messages: 0, parts: 0,
        errorReport: { noNetwork: 0, noContents: 0, contentTooLong: 0, duplicates: 1, optedOuts: 0, faults: [{ error: "invalid destination" }] },
      }),
    });
    await expect(
      smsportalAdapter.send({ channel: "sms", to: "bad-number", body: "Hi" }, creds),
    ).rejects.toThrow("rejected message");
  });
});

// DLR payload is a flat object per the SMSPortal docs:
// { eventId, customerId, status, phoneNumber, sentUtc, receivedUtc, ... }
describe("parseWebhook", () => {
  it("matches on customerId (our messageId) when present", async () => {
    const body = { eventId: 17291650560, customerId: "our-uuid-123", status: "DELIVRD", phoneNumber: "27834966860" };
    const events = await smsportalAdapter.parseWebhook({ headers: {}, body }, { config: {}, secret });
    expect(events).toHaveLength(1);
    expect(events[0]!.status).toBe("delivered");
    expect(events[0]!.providerMessageId).toBe("our-uuid-123");
  });

  it("falls back to eventId when customerId is absent", async () => {
    const body = { eventId: 17291650560, status: "DELIVRD", phoneNumber: "27834966860" };
    const events = await smsportalAdapter.parseWebhook({ headers: {}, body }, { config: {}, secret });
    expect(events).toHaveLength(1);
    expect(events[0]!.providerMessageId).toBe("17291650560");
  });

  it("maps UNDELIV, EXPIRED, BLIST, CANCELLED, NOROUTE to failed", async () => {
    for (const status of ["UNDELIV", "EXPIRED", "BLIST", "CANCELLED", "NOROUTE"]) {
      const events = await smsportalAdapter.parseWebhook(
        { headers: {}, body: { eventId: 1, customerId: "x", status } },
        { config: {}, secret },
      );
      expect(events[0]!.status).toBe("failed");
    }
  });

  it("maps SUBMITD and STAGED to sent", async () => {
    for (const status of ["SUBMITD", "STAGED"]) {
      const events = await smsportalAdapter.parseWebhook(
        { headers: {}, body: { eventId: 1, customerId: "x", status } },
        { config: {}, secret },
      );
      expect(events[0]!.status).toBe("sent");
    }
  });

  it("skips unknown statuses", async () => {
    const events = await smsportalAdapter.parseWebhook(
      { headers: {}, body: { eventId: 1, customerId: "x", status: "UNKNOWN_STATUS" } },
      { config: {}, secret },
    );
    expect(events).toHaveLength(0);
  });

  it("returns empty array when both customerId and eventId are missing", async () => {
    const events = await smsportalAdapter.parseWebhook(
      { headers: {}, body: { status: "DELIVRD" } },
      { config: {}, secret },
    );
    expect(events).toHaveLength(0);
  });

  it("returns empty array when status is missing", async () => {
    const events = await smsportalAdapter.parseWebhook(
      { headers: {}, body: { eventId: 1, customerId: "x" } },
      { config: {}, secret },
    );
    expect(events).toHaveLength(0);
  });
});
