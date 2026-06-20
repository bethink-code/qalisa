import type { Secret } from "@qalisa/shared";
import type { ChannelAdapter, HealthResult } from "./types";

const PHASE_3 = "SMSPortal send/webhook arrives in Phase 3";

/**
 * SMSPortal (SMS). Phase 1 stub: validateCredentials checks the secret is
 * present. Phase 3 replaces it with a real REST auth call + delivery callbacks.
 */
export const smsportalAdapter: ChannelAdapter = {
  channel: "sms",
  provider: "smsportal",

  async validateCredentials(_config: Record<string, unknown>, secret: Secret): Promise<HealthResult> {
    if (!secret.reveal()) {
      return { ok: false, detail: "missing API credentials" };
    }
    return { ok: true, detail: "credentials present (stub check; live auth in Phase 3)" };
  },

  send() {
    throw new Error(PHASE_3);
  },

  parseWebhook() {
    throw new Error(PHASE_3);
  },
};
