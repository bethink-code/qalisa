import { Secret } from "@qalisa/shared";
import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { metaAdapter } from "./meta";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const config = { wabaId: "waba-123", phoneNumberId: "phone-456" };
const secret = new Secret("system-user-token-abc");
const creds = { config, secret };

beforeEach(() => mockFetch.mockReset());
afterEach(() => vi.restoreAllMocks());

describe("validateCredentials", () => {
  it("returns ok when phone number is verified", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ id: "phone-456", display_phone_number: "+27821234567", verified_name: "Acme" }),
    });
    const result = await metaAdapter.validateCredentials(config, secret);
    expect(result.ok).toBe(true);
    expect(result.detail).toContain("+27821234567");
  });

  it("returns not-ok for 401", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 401, json: async () => ({}) });
    const result = await metaAdapter.validateCredentials(config, secret);
    expect(result.ok).toBe(false);
    expect(result.detail).toContain("invalid or expired");
  });

  it("returns not-ok for other errors with Meta error message", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: { message: "Invalid phone number ID" } }),
    });
    const result = await metaAdapter.validateCredentials(config, secret);
    expect(result.ok).toBe(false);
    expect(result.detail).toContain("Invalid phone number ID");
  });

  it("returns not-ok for network errors", async () => {
    mockFetch.mockRejectedValue(new Error("ECONNREFUSED"));
    const result = await metaAdapter.validateCredentials(config, secret);
    expect(result.ok).toBe(false);
    expect(result.detail).toContain("network error");
  });

  it("returns not-ok when wabaId is missing", async () => {
    const result = await metaAdapter.validateCredentials({ phoneNumberId: "phone-456" }, secret);
    expect(result.ok).toBe(false);
    expect(result.detail).toContain("missing 'wabaId'");
  });

  it("returns not-ok when phoneNumberId is missing", async () => {
    const result = await metaAdapter.validateCredentials({ wabaId: "waba-123" }, secret);
    expect(result.ok).toBe(false);
    expect(result.detail).toContain("missing 'phoneNumberId'");
  });
});

describe("send", () => {
  const sendSuccess = {
    ok: true,
    json: async () => ({
      messaging_product: "whatsapp",
      contacts: [{ input: "+27821234567", wa_id: "27821234567" }],
      messages: [{ id: "wamid.HBgL..." }],
    }),
  };

  it("sends a text message and returns providerMessageId", async () => {
    mockFetch.mockResolvedValue(sendSuccess);
    const result = await metaAdapter.send(
      { channel: "whatsapp", to: "+27821234567", body: "Hello!" },
      creds,
    );
    expect(result.providerMessageId).toBe("wamid.HBgL...");
  });

  it("sends to correct phoneNumberId endpoint", async () => {
    mockFetch.mockResolvedValue(sendSuccess);
    await metaAdapter.send({ channel: "whatsapp", to: "+27821234567", body: "Hi" }, creds);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("phone-456/messages"),
      expect.any(Object),
    );
  });

  it("sends correct payload structure", async () => {
    mockFetch.mockResolvedValue(sendSuccess);
    await metaAdapter.send({ channel: "whatsapp", to: "+27821234567", body: "Hello!" }, creds);
    const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string) as {
      messaging_product: string;
      to: string;
      type: string;
      text: { body: string };
    };
    expect(body.messaging_product).toBe("whatsapp");
    expect(body.to).toBe("+27821234567");
    expect(body.type).toBe("text");
    expect(body.text.body).toBe("Hello!");
  });

  it("throws on non-ok response with Meta error detail", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: { message: "Invalid recipient" } }),
    });
    await expect(
      metaAdapter.send({ channel: "whatsapp", to: "bad", body: "Hi" }, creds),
    ).rejects.toThrow("Meta send failed (400): Invalid recipient");
  });

  it("throws when no message id is returned", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ messages: [] }),
    });
    await expect(
      metaAdapter.send({ channel: "whatsapp", to: "+27821234567", body: "Hi" }, creds),
    ).rejects.toThrow("no message id");
  });
});

describe("parseWebhook", () => {
  const deliveredPayload = {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "waba-123",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              statuses: [
                { id: "wamid.abc", status: "delivered", timestamp: "1234567890", recipient_id: "27821234567" },
              ],
            },
          },
        ],
      },
    ],
  };

  it("parses a delivered status event", async () => {
    const events = await metaAdapter.parseWebhook(
      { headers: {}, body: deliveredPayload },
      { config: {}, secret },
    );
    expect(events).toHaveLength(1);
    expect(events[0]!.status).toBe("delivered");
    expect(events[0]!.providerMessageId).toBe("wamid.abc");
  });

  it("maps 'read' to delivered", async () => {
    const body = {
      ...deliveredPayload,
      entry: [{ ...deliveredPayload.entry[0]!, changes: [{ field: "messages", value: { statuses: [{ id: "wamid.x", status: "read", timestamp: "1", recipient_id: "x" }] } }] }],
    };
    const events = await metaAdapter.parseWebhook({ headers: {}, body }, { config: {}, secret });
    expect(events[0]!.status).toBe("delivered");
  });

  it("parses a sent event", async () => {
    const body = {
      ...deliveredPayload,
      entry: [{ ...deliveredPayload.entry[0]!, changes: [{ field: "messages", value: { statuses: [{ id: "wamid.x", status: "sent" }] } }] }],
    };
    const events = await metaAdapter.parseWebhook({ headers: {}, body }, { config: {}, secret });
    expect(events[0]!.status).toBe("sent");
  });

  it("parses a failed event", async () => {
    const body = {
      ...deliveredPayload,
      entry: [{ ...deliveredPayload.entry[0]!, changes: [{ field: "messages", value: { statuses: [{ id: "wamid.x", status: "failed" }] } }] }],
    };
    const events = await metaAdapter.parseWebhook({ headers: {}, body }, { config: {}, secret });
    expect(events[0]!.status).toBe("failed");
  });

  it("skips entries with unknown status", async () => {
    const body = {
      ...deliveredPayload,
      entry: [{ ...deliveredPayload.entry[0]!, changes: [{ field: "messages", value: { statuses: [{ id: "wamid.x", status: "initiated" }] } }] }],
    };
    const events = await metaAdapter.parseWebhook({ headers: {}, body }, { config: {}, secret });
    expect(events).toHaveLength(0);
  });

  it("returns empty array for non-WABA object types", async () => {
    const events = await metaAdapter.parseWebhook(
      { headers: {}, body: { object: "something_else" } },
      { config: {}, secret },
    );
    expect(events).toHaveLength(0);
  });

  it("skips changes where field is not 'messages'", async () => {
    const body = {
      object: "whatsapp_business_account",
      entry: [{ id: "x", changes: [{ field: "account_review", value: { statuses: [{ id: "wamid.x", status: "delivered" }] } }] }],
    };
    const events = await metaAdapter.parseWebhook({ headers: {}, body }, { config: {}, secret });
    expect(events).toHaveLength(0);
  });

  it("verifies HMAC-SHA256 signature when appSecret is configured", async () => {
    const appSecret = "test-app-secret";
    const rawBody = Buffer.from(JSON.stringify(deliveredPayload));
    const sig = createHmac("sha256", appSecret).update(rawBody).digest("hex");
    const events = await metaAdapter.parseWebhook(
      { headers: { "x-hub-signature-256": `sha256=${sig}` }, body: deliveredPayload, rawBody },
      { config: { ...config, appSecret }, secret },
    );
    expect(events).toHaveLength(1);
  });

  it("throws when signature is wrong", async () => {
    const rawBody = Buffer.from(JSON.stringify(deliveredPayload));
    await expect(
      metaAdapter.parseWebhook(
        { headers: { "x-hub-signature-256": "sha256=badsignature" }, body: deliveredPayload, rawBody },
        { config: { ...config, appSecret: "test-app-secret" }, secret },
      ),
    ).rejects.toThrow("signature verification failed");
  });

  it("skips signature check when appSecret is not in config", async () => {
    const rawBody = Buffer.from(JSON.stringify(deliveredPayload));
    const events = await metaAdapter.parseWebhook(
      { headers: { "x-hub-signature-256": "sha256=garbage" }, body: deliveredPayload, rawBody },
      { config: {}, secret },
    );
    expect(events).toHaveLength(1);
  });

  it("handles multiple statuses across multiple entries", async () => {
    const body = {
      object: "whatsapp_business_account",
      entry: [
        { id: "e1", changes: [{ field: "messages", value: { statuses: [{ id: "wamid.a", status: "delivered" }, { id: "wamid.b", status: "failed" }] } }] },
        { id: "e2", changes: [{ field: "messages", value: { statuses: [{ id: "wamid.c", status: "sent" }] } }] },
      ],
    };
    const events = await metaAdapter.parseWebhook({ headers: {}, body }, { config: {}, secret });
    expect(events).toHaveLength(3);
  });
});
