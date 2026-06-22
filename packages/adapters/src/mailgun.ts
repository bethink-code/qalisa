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

function baseUrl(region?: unknown): string {
  return region === "eu"
    ? "https://api.eu.mailgun.net/v3"
    : "https://api.mailgun.net/v3";
}

function basicAuth(apiKey: string): string {
  return "Basic " + Buffer.from(`api:${apiKey}`).toString("base64");
}

export const mailgunAdapter: ChannelAdapter = {
  channel: "email",
  provider: "mailgun",

  async validateCredentials(config: Record<string, unknown>, secret: Secret): Promise<HealthResult> {
    const domain = typeof config.domain === "string" ? config.domain.trim() : "";
    if (!domain) return { ok: false, detail: "missing 'domain' in config" };
    const apiKey = secret.reveal();
    if (!apiKey) return { ok: false, detail: "missing API key" };

    let res: Response;
    try {
      res = await fetch(`${baseUrl(config.region)}/domains/${domain}`, {
        headers: { Authorization: basicAuth(apiKey) },
      });
    } catch (err) {
      return { ok: false, detail: `network error: ${String(err)}` };
    }

    if (res.ok) return { ok: true, detail: `domain '${domain}' is active` };
    if (res.status === 401) return { ok: false, detail: "invalid API key" };
    if (res.status === 404) return { ok: false, detail: `domain '${domain}' not found in Mailgun` };
    return { ok: false, detail: `Mailgun returned ${res.status}` };
  },

  async send(msg: OutboundMessage, creds: ResolvedCreds): Promise<SendResult> {
    const { config, secret } = creds;
    const domain = String(config.domain ?? "");
    const apiKey = secret.reveal();
    const from =
      typeof config.fromAddress === "string" && config.fromAddress
        ? config.fromAddress
        : `noreply@${domain}`;

    const form = new URLSearchParams();
    form.set("from", from);
    form.set("to", msg.to);
    form.set("subject", msg.subject ?? "");
    form.set("text", msg.body ?? "");

    let res: Response;
    try {
      res = await fetch(`${baseUrl(config.region)}/${domain}/messages`, {
        method: "POST",
        headers: {
          Authorization: basicAuth(apiKey),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: form.toString(),
      });
    } catch (err) {
      throw new Error(`Mailgun network error: ${String(err)}`);
    }

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Mailgun send failed (${res.status}): ${body}`);
    }

    const data = (await res.json()) as { id?: string };
    const providerMessageId = (data.id ?? "").replace(/[<>]/g, "");
    return { providerMessageId };
  },

  async parseWebhook(req: RawWebhook, creds: ResolvedCreds): Promise<DeliveryEvent[]> {
    const body = req.body as Record<string, unknown>;
    const sig = body["signature"] as Record<string, unknown> | undefined;

    // Verify HMAC-SHA256 signature when a signing key is configured.
    const signingKey =
      typeof creds.config.webhookSigningKey === "string" ? creds.config.webhookSigningKey : null;
    if (signingKey && sig) {
      const timestamp = String(sig["timestamp"] ?? "");
      const token = String(sig["token"] ?? "");
      const signature = String(sig["signature"] ?? "");
      const expected = createHmac("sha256", signingKey).update(timestamp + token).digest("hex");
      if (
        expected.length !== signature.length ||
        !timingSafeEqual(Buffer.from(expected, "utf8"), Buffer.from(signature, "utf8"))
      ) {
        throw new Error("Mailgun webhook signature verification failed");
      }
    }

    const eventData = body["event-data"] as Record<string, unknown> | undefined;
    if (!eventData) return [];

    const event = String(eventData["event"] ?? "");
    const msgHeaders = (
      (eventData["message"] as Record<string, unknown> | undefined)?.["headers"] as
        | Record<string, unknown>
        | undefined
    );
    const rawId = String(msgHeaders?.["message-id"] ?? "");
    const providerMessageId = rawId.replace(/[<>]/g, "");
    if (!providerMessageId) return [];

    let status: DeliveryEvent["status"] | null = null;
    if (event === "delivered") status = "delivered";
    else if (event === "failed" || event === "bounced") status = "failed";
    else if (event === "accepted") status = "sent";

    if (!status) return [];
    return [{ providerMessageId, status, raw: eventData }];
  },
};
