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

const BASE_URL = "https://rest.smsportal.com/v1";

/** Normalise to bare international digits (no + or leading 0). e.g. +27831234567, 0831234567, 831234567 → 27831234567 */
function normaliseMsisdn(raw: string, defaultCountryCode = "27"): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("00")) return digits.slice(2);
  if (digits.startsWith("0")) return defaultCountryCode + digits.slice(1);
  if (raw.startsWith("+")) return digits;
  return digits;
}

/** Authenticate and return a short-lived JWT. */
async function getToken(clientId: string, clientSecret: string): Promise<string> {
  const basicToken = btoa(`${clientId}:${clientSecret}`);
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/Authentication`, {
      method: "GET",
      headers: { Authorization: `Basic ${basicToken}` },
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    throw new Error(`SMSPortal network error: ${String(err)}`);
  }

  if (res.status === 401) throw new Error("invalid SMSPortal credentials");
  if (!res.ok) throw new Error(`SMSPortal auth failed (${res.status})`);

  const data = (await res.json()) as { token?: string };
  if (!data.token) throw new Error("SMSPortal returned no token");
  return data.token;
}

/** Map SMSPortal status strings to normalised DeliveryEvent status. */
function mapStatus(raw: string): DeliveryEvent["status"] | null {
  const s = raw.toUpperCase();
  if (s === "DELIVERED") return "delivered";
  if (["FAILED", "UNDELIVERED", "EXPIRED", "REJECTED"].includes(s)) return "failed";
  if (["SUBMITTED", "BUFFERED", "SENT"].includes(s)) return "sent";
  return null;
}

export const smsportalAdapter: ChannelAdapter = {
  channel: "sms",
  provider: "smsportal",

  async validateCredentials(config: Record<string, unknown>, secret: Secret): Promise<HealthResult> {
    const clientId = typeof config.clientId === "string" ? config.clientId.trim() : "";
    if (!clientId) return { ok: false, detail: "missing 'clientId' in config" };
    const clientSecret = secret.reveal();
    if (!clientSecret) return { ok: false, detail: "missing client secret" };

    try {
      await getToken(clientId, clientSecret);
      return { ok: true, detail: "authenticated successfully" };
    } catch (err) {
      return { ok: false, detail: err instanceof Error ? err.message : String(err) };
    }
  },

  async send(msg: OutboundMessage, creds: ResolvedCreds): Promise<SendResult> {
    const clientId = String(creds.config.clientId ?? "");
    const token = await getToken(clientId, creds.secret.reveal());

    let res: Response;
    try {
      res = await fetch(`${BASE_URL}/BulkMessages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: [{ destination: normaliseMsisdn(msg.to), content: msg.body ?? "" }],
        }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (err) {
      throw new Error(`SMSPortal network error: ${String(err)}`);
    }

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`SMSPortal send failed (${res.status}): ${body}`);
    }

    const data = (await res.json()) as {
      errors?: { messageId?: string; error?: string }[];
      messages?: { messageId?: string }[];
    };

    if (data.errors?.length) {
      const first = data.errors[0];
      throw new Error(`SMSPortal rejected message: ${first?.error ?? "unknown error"}`);
    }

    const providerMessageId = data.messages?.[0]?.messageId ?? "";
    if (!providerMessageId) throw new Error("SMSPortal returned no messageId");
    return { providerMessageId };
  },

  async parseWebhook(req: RawWebhook): Promise<DeliveryEvent[]> {
    // SMSPortal does not sign delivery callbacks — authenticity relies on
    // the tenantId-scoped webhook URL being unpredictable.
    const body = req.body as Record<string, unknown>;
    const rawMessages = body["messages"];
    if (!Array.isArray(rawMessages)) return [];

    const events: DeliveryEvent[] = [];
    for (const m of rawMessages as Record<string, unknown>[]) {
      const providerMessageId = String(m["messageId"] ?? "");
      const rawStatus = String(m["status"] ?? "");
      if (!providerMessageId || !rawStatus) continue;
      const status = mapStatus(rawStatus);
      if (!status) continue;
      events.push({ providerMessageId, status, raw: m });
    }
    return events;
  },
};
