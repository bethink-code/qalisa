import type { Channel, Provider, Secret } from "@qalisa/shared";

/** Result of a test-connection health check. Drives ProviderCredential.status. */
export interface HealthResult {
  ok: boolean;
  detail?: string;
  /** For providers with expiring tokens (e.g. Meta), when the token expires. */
  tokenExpiresAt?: Date;
}

/** Resolved per-send: non-secret config plus the decrypted secret. */
export interface ResolvedCreds {
  config: Record<string, unknown>;
  secret: Secret;
}

export interface OutboundMessage {
  channel: Channel;
  to: string;
  body?: string;
  templateId?: string;
  variables?: Record<string, string>;
}

export interface SendResult {
  providerMessageId: string;
}

export interface DeliveryEvent {
  providerMessageId: string;
  status: "sent" | "delivered" | "failed";
  raw?: unknown;
}

export interface RawWebhook {
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
  rawBody?: Uint8Array;
}

/**
 * Every provider implements this one interface. Upstream code never branches on
 * provider — adding a channel/provider touches only this package + the registry.
 */
export interface ChannelAdapter {
  channel: Channel;
  provider: Provider;

  /** Test-connection health check. */
  validateCredentials(config: Record<string, unknown>, secret: Secret): Promise<HealthResult>;

  /** Send one message. Credentials are resolved outside and passed in, per-send. */
  send(msg: OutboundMessage, creds: ResolvedCreds): Promise<SendResult>;

  /** Verify + parse an inbound delivery webhook into normalised events. */
  parseWebhook(req: RawWebhook, creds: ResolvedCreds): Promise<DeliveryEvent[]>;
}
