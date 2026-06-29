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

/** Map SMSPortal delivery receipt status codes to normalised DeliveryEvent status.
 *  Codes from https://docs.smsportal.com/docs/delivery-statuses */
function mapStatus(raw: string): DeliveryEvent["status"] | null {
  const s = raw.toUpperCase();
  if (s === "DELIVRD") return "delivered";
  if (["UNDELIV", "EXPIRED", "BLIST", "CANCELLED", "NOROUTE"].includes(s)) return "failed";
  if (["SUBMITD", "STAGED"].includes(s)) return "sent";
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
          messages: [{
            destination: normaliseMsisdn(msg.to),
            content: msg.body ?? "",
            // Pass our internal ID so it echoes back in DLR webhooks as customerId.
            ...(msg.messageId ? { customerId: msg.messageId } : {}),
          }],
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

    // Actual SMSPortal BulkMessages response shape:
    // { cost, remainingBalance, eventId, messages: <count>, parts, errorReport: { faults: [] } }
    // "messages" is a COUNT not an array; the batch reference is "eventId".
    const raw = (await res.json()) as {
      eventId?: number;
      errorReport?: { faults?: unknown[] };
    };

    const faults = raw.errorReport?.faults ?? [];
    if (faults.length) {
      throw new Error(`SMSPortal rejected message: ${JSON.stringify(faults[0])}`);
    }

    // Prefer our own messageId (echoed back as customerId in DLRs) for matching.
    // Fall back to SMSPortal's eventId if messageId wasn't supplied.
    const providerMessageId = msg.messageId ?? (raw.eventId != null ? String(raw.eventId) : "");
    return { providerMessageId };
  },

  async parseWebhook(req: RawWebhook): Promise<DeliveryEvent[]> {
    // SMSPortal delivery receipts are flat objects — one POST per message:
    // { eventId, status, phoneNumber, sentUtc, receivedUtc, ... }
    // eventId matches what the BulkMessages send response returns.
    // SMSPortal does not sign callbacks; the tenantId-scoped URL is the auth.
    const body = req.body as Record<string, unknown>;
    // customerId = our internal messageId (passed at send time); eventId = batch ID fallback.
    const customerId = body["customerId"] ? String(body["customerId"]) : "";
    const eventId = body["eventId"] != null ? String(body["eventId"]) : "";
    const providerMessageId = customerId || eventId;
    const rawStatus = String(body["status"] ?? "");
    if (!providerMessageId || !rawStatus) return [];
    const status = mapStatus(rawStatus);
    if (!status) return [];
    return [{ providerMessageId, status, raw: body }];
  },
};
