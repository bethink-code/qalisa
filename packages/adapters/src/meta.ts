import { createHmac, timingSafeEqual } from "node:crypto";
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

const GRAPH_URL = "https://graph.facebook.com/v21.0";

function bearer(token: string) {
  return { Authorization: `Bearer ${token}` };
}

/** Map Meta status strings to normalised DeliveryEvent status. */
function mapStatus(raw: string): DeliveryEvent["status"] | null {
  if (raw === "delivered" || raw === "read") return "delivered";
  if (raw === "sent") return "sent";
  if (raw === "failed") return "failed";
  return null;
}

/**
 * Meta WhatsApp Cloud API (BYOC — every tenant uses their own WABA).
 * config: { wabaId, phoneNumberId, appSecret?, webhookVerifyToken? }
 * secret: system-user access token (long-lived).
 */
export const metaAdapter: ChannelAdapter = {
  channel: "whatsapp",
  provider: "meta_cloud_api",

  async validateCredentials(config: Record<string, unknown>, secret: Secret): Promise<HealthResult> {
    const phoneNumberId = typeof config.phoneNumberId === "string" ? config.phoneNumberId.trim() : "";
    const wabaId = typeof config.wabaId === "string" ? config.wabaId.trim() : "";
    const token = secret.reveal();

    if (!wabaId) return { ok: false, detail: "missing 'wabaId' in config" };
    if (!phoneNumberId) return { ok: false, detail: "missing 'phoneNumberId' in config" };
    if (!token) return { ok: false, detail: "missing system-user token" };

    let res: Response;
    try {
      res = await fetch(
        `${GRAPH_URL}/${phoneNumberId}?fields=id,display_phone_number,verified_name`,
        { headers: bearer(token), signal: AbortSignal.timeout(10_000) },
      );
    } catch (err) {
      return { ok: false, detail: `network error: ${String(err)}` };
    }

    if (res.ok) {
      const data = (await res.json()) as { display_phone_number?: string };
      return { ok: true, detail: `phone number '${data.display_phone_number ?? phoneNumberId}' verified` };
    }
    if (res.status === 401 || res.status === 403) return { ok: false, detail: "invalid or expired access token" };
    const err = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    return { ok: false, detail: err.error?.message ?? `Meta returned ${res.status}` };
  },

  async send(msg: OutboundMessage, creds: ResolvedCreds): Promise<SendResult> {
    const { config, secret } = creds;
    const phoneNumberId = String(config.phoneNumberId ?? "");
    const token = secret.reveal();

    // Build template components for send payload.
    let templateComponents: unknown[] | undefined;
    if (msg.metaTemplateName) {
      if (msg.whatsappCategory === "AUTHENTICATION" && msg.templateParams?.length) {
        // Auth templates use a single positional OTP code.
        templateComponents = [{ type: "body", parameters: [{ type: "text", text: msg.templateParams[0] }] }];
      } else if (msg.templateVars && Object.keys(msg.templateVars).length > 0) {
        // MARKETING/UTILITY: named parameters.
        templateComponents = [{
          type: "body",
          parameters: Object.entries(msg.templateVars).map(([parameter_name, text]) => ({ type: "text", parameter_name, text })),
        }];
      } else if (msg.templateParams?.length) {
        // Legacy positional fallback.
        templateComponents = [{ type: "body", parameters: msg.templateParams.map((text) => ({ type: "text", text })) }];
      }
    }

    const payload = msg.metaTemplateName
      ? {
          messaging_product: "whatsapp",
          to: msg.to,
          type: "template",
          template: {
            name: msg.metaTemplateName,
            language: { code: msg.whatsappLanguage ?? "en" },
            ...(templateComponents ? { components: templateComponents } : {}),
          },
        }
      : {
          messaging_product: "whatsapp",
          to: msg.to,
          type: "text",
          text: { body: msg.body ?? "" },
        };

    let res: Response;
    try {
      res = await fetch(`${GRAPH_URL}/${phoneNumberId}/messages`, {
        method: "POST",
        headers: { ...bearer(token), "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (err) {
      throw new Error(`Meta network error: ${String(err)}`);
    }

    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      throw new Error(`Meta send failed (${res.status}): ${data.error?.message ?? ""}`);
    }

    const data = (await res.json()) as { messages?: { id?: string }[] };
    const providerMessageId = data.messages?.[0]?.id ?? "";
    if (!providerMessageId) throw new Error("Meta returned no message id");
    return { providerMessageId };
  },

  async parseWebhook(req: RawWebhook, creds: ResolvedCreds): Promise<DeliveryEvent[]> {
    // Require X-Hub-Signature-256 verification — reject if appSecret is not configured.
    const appSecret = typeof creds.config.appSecret === "string" ? creds.config.appSecret : null;
    if (!appSecret) {
      throw new Error("Meta webhook rejected: appSecret is not configured on this credential");
    }
    if (!req.rawBody) {
      throw new Error("Meta webhook rejected: raw body unavailable for signature verification");
    }
    const sigHeader = req.headers["x-hub-signature-256"];
    const sigRaw = Array.isArray(sigHeader) ? sigHeader[0] : sigHeader;
    const signature = String(sigRaw ?? "").replace(/^sha256=/, "");
    const expected = createHmac("sha256", appSecret).update(req.rawBody).digest("hex");
    if (
      expected.length !== signature.length ||
      !timingSafeEqual(Buffer.from(expected, "utf8"), Buffer.from(signature, "utf8"))
    ) {
      throw new Error("Meta webhook signature verification failed");
    }

    const body = req.body as Record<string, unknown>;
    if (body["object"] !== "whatsapp_business_account") return [];

    const entries = body["entry"] as Record<string, unknown>[] | undefined;
    if (!Array.isArray(entries)) return [];

    const events: DeliveryEvent[] = [];
    for (const entry of entries) {
      const changes = entry["changes"] as Record<string, unknown>[] | undefined;
      if (!Array.isArray(changes)) continue;
      for (const change of changes) {
        if (change["field"] !== "messages") continue;
        const value = change["value"] as Record<string, unknown> | undefined;
        const statuses = value?.["statuses"] as Record<string, unknown>[] | undefined;
        if (!Array.isArray(statuses)) continue;
        for (const s of statuses) {
          const providerMessageId = String(s["id"] ?? "");
          const rawStatus = String(s["status"] ?? "");
          if (!providerMessageId || !rawStatus) continue;
          const status = mapStatus(rawStatus);
          if (!status) continue;
          events.push({ providerMessageId, status, raw: s });
        }
      }
    }
    return events;
  },
};
