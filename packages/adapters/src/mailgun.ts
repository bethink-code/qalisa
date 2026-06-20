import type { Secret } from "@qalisa/shared";
import type { ChannelAdapter, HealthResult } from "./types";

const PHASE_2 = "Mailgun send/webhook arrives in Phase 2";

/**
 * Mailgun (email). Phase 1 stub: validateCredentials does a shape check only.
 * Phase 2 replaces it with a real Mailgun API call and implements send +
 * signature-verified webhook parsing.
 */
export const mailgunAdapter: ChannelAdapter = {
  channel: "email",
  provider: "mailgun",

  async validateCredentials(config: Record<string, unknown>, secret: Secret): Promise<HealthResult> {
    const domain = typeof config.domain === "string" ? config.domain.trim() : "";
    if (!domain) {
      return { ok: false, detail: "missing 'domain' in config" };
    }
    if (!secret.reveal()) {
      return { ok: false, detail: "missing API key" };
    }
    return { ok: true, detail: "config present (stub check; live ping in Phase 2)" };
  },

  send() {
    throw new Error(PHASE_2);
  },

  parseWebhook() {
    throw new Error(PHASE_2);
  },
};
