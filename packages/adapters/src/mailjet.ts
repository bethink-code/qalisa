import type { Secret } from "@qalisa/shared";
import type {
  ChannelAdapter,
  DeliveryEvent,
  HealthResult,
  OutboundMessage,
  RawWebhook,
  ResolvedCreds,
  SendResult,
} from "./types";

const BASE_URL = "https://api.mailjet.com";

function basicAuth(apiKey: string, secretKey: string): string {
  return "Basic " + Buffer.from(`${apiKey}:${secretKey}`).toString("base64");
}

export const mailjetAdapter: ChannelAdapter = {
  channel: "email",
  provider: "mailjet",

  async validateCredentials(config: Record<string, unknown>, secret: Secret): Promise<HealthResult> {
    const apiKey = typeof config.apiKey === "string" ? config.apiKey.trim() : "";
    if (!apiKey) return { ok: false, detail: "missing 'apiKey' in config" };
    const secretKey = secret.reveal();
    if (!secretKey) return { ok: false, detail: "missing secret key" };
    const fromAddress = typeof config.fromAddress === "string" ? config.fromAddress.trim() : "";
    if (!fromAddress) return { ok: false, detail: "missing 'fromAddress' in config" };

    let res: Response;
    try {
      res = await fetch(`${BASE_URL}/v3/REST/sender`, {
        headers: { Authorization: basicAuth(apiKey, secretKey) },
        signal: AbortSignal.timeout(10_000),
      });
    } catch (err) {
      return { ok: false, detail: `network error: ${String(err)}` };
    }

    if (res.ok) return { ok: true, detail: `authenticated — from: ${fromAddress}` };
    if (res.status === 401) return { ok: false, detail: "invalid API key or secret key" };
    return { ok: false, detail: `Mailjet returned ${res.status}` };
  },

  async send(msg: OutboundMessage, creds: ResolvedCreds): Promise<SendResult> {
    const { config, secret } = creds;
    const apiKey = String(config.apiKey ?? "");
    const secretKey = secret.reveal();
    const fromAddress = String(config.fromAddress ?? "");
    const fromName = typeof config.fromName === "string" ? config.fromName : undefined;

    let res: Response;
    try {
      res = await fetch(`${BASE_URL}/v3.1/send`, {
        method: "POST",
        headers: {
          Authorization: basicAuth(apiKey, secretKey),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          Messages: [{
            From: { Email: fromAddress, ...(fromName ? { Name: fromName } : {}) },
            To: [{ Email: msg.to }],
            Subject: msg.subject ?? "",
            TextPart: msg.body ?? "",
            ...(msg.messageId ? { CustomID: msg.messageId } : {}),
          }],
        }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (err) {
      throw new Error(`Mailjet network error: ${String(err)}`);
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Mailjet send failed (${res.status}): ${text}`);
    }

    const data = (await res.json()) as {
      Messages: Array<{
        Status: string;
        To?: Array<{ MessageID?: number }>;
        Errors?: Array<{ ErrorMessage?: string }>;
      }>;
    };

    const first = data.Messages?.[0];
    if (!first || first.Status !== "success") {
      const errMsg = first?.Errors?.[0]?.ErrorMessage ?? "unknown error";
      throw new Error(`Mailjet rejected message: ${errMsg}`);
    }

    // Prefer our CustomID (echoed in DLR as CustomID) for delivery receipt matching.
    // Fall back to Mailjet's MessageID (large integer, stored as string).
    const mjId = first.To?.[0]?.MessageID;
    const providerMessageId = msg.messageId ?? (mjId != null ? String(mjId) : "");
    return { providerMessageId };
  },

  async parseWebhook(req: RawWebhook): Promise<DeliveryEvent[]> {
    // Mailjet sends either a single event object or an array when "Group events" is enabled.
    // CustomID = our internal messageId passed at send time (most reliable match).
    // MessageID = Mailjet's large integer ID (fallback).
    // "sent" = destination SMTP accepted the message = our "delivered".
    // "bounce" / "blocked" = our "failed".
    const raw = req.body;
    const items: Record<string, unknown>[] = Array.isArray(raw)
      ? (raw as Record<string, unknown>[])
      : [raw as Record<string, unknown>];

    const results: DeliveryEvent[] = [];
    for (const body of items) {
      const event = String(body["event"] ?? "");
      const customId = body["CustomID"] ? String(body["CustomID"]) : "";
      const messageId = body["MessageID"] != null ? String(body["MessageID"]) : "";
      const providerMessageId = customId || messageId;

      if (!providerMessageId || !event) continue;

      let status: DeliveryEvent["status"] | null = null;
      if (event === "sent") status = "delivered";
      else if (event === "bounce" || event === "blocked") status = "failed";

      if (!status) continue;
      results.push({ providerMessageId, status, raw: body });
    }
    return results;
  },
};
