import type { Channel, Provider } from "@qalisa/shared";
import { mailgunAdapter } from "./mailgun";
import { metaAdapter } from "./meta";
import { smsportalAdapter } from "./smsportal";
import type { ChannelAdapter } from "./types";

const ADAPTERS: readonly ChannelAdapter[] = [mailgunAdapter, smsportalAdapter, metaAdapter];

/** Resolve the adapter for a channel/provider pair. The only dispatch point. */
export function getAdapter(channel: Channel, provider: Provider): ChannelAdapter {
  const adapter = ADAPTERS.find((a) => a.channel === channel && a.provider === provider);
  if (!adapter) {
    throw new Error(`No adapter registered for ${channel}/${provider}`);
  }
  return adapter;
}
