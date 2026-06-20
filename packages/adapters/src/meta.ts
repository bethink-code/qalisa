import type { Secret } from "@qalisa/shared";
import type { ChannelAdapter, HealthResult } from "./types";

const PHASE_4 = "Meta WhatsApp send/webhook arrives in Phase 4";

/**
 * Meta Cloud API (WhatsApp). Strict BYOC: every tenant sends through their OWN
 * WABA. Phase 1 stub: validateCredentials checks WABA id, phone-number-id and
 * the system-user token are present. Phase 4 adds template sends + token-expiry.
 */
export const metaAdapter: ChannelAdapter = {
  channel: "whatsapp",
  provider: "meta_cloud_api",

  async validateCredentials(config: Record<string, unknown>, secret: Secret): Promise<HealthResult> {
    const wabaId = typeof config.wabaId === "string" ? config.wabaId.trim() : "";
    const phoneNumberId =
      typeof config.phoneNumberId === "string" ? config.phoneNumberId.trim() : "";
    if (!wabaId) {
      return { ok: false, detail: "missing 'wabaId' in config" };
    }
    if (!phoneNumberId) {
      return { ok: false, detail: "missing 'phoneNumberId' in config" };
    }
    if (!secret.reveal()) {
      return { ok: false, detail: "missing system-user token" };
    }
    return { ok: true, detail: "config present (stub check; live ping in Phase 4)" };
  },

  send() {
    throw new Error(PHASE_4);
  },

  parseWebhook() {
    throw new Error(PHASE_4);
  },
};
