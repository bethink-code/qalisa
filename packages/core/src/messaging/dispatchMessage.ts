import { getAdapter } from "@qalisa/adapters";
import type { Db } from "@qalisa/db";
import { messages, providerCredentials, usageEvents } from "@qalisa/db/schema";
import type { Channel, Provider } from "@qalisa/shared";
import { and, eq } from "drizzle-orm";
import type { Vault } from "../vault/vault";

export interface DispatchInput {
  messageId: string;
  channel: Channel;
  provider: Provider;
  credentialId: string;
  to: string;
  subject?: string;
  resolvedBody: string;
}

/**
 * Execute an outbound send for an already-queued message record.
 * Resolves the credential secret, calls the adapter, then writes
 * the final status and UsageEvent. On adapter error the record is
 * marked "failed" — BullMQ will retry the job per queue config.
 */
export async function dispatchMessage(
  tenantId: string,
  input: DispatchInput,
  deps: { db: Db; vault: Vault },
): Promise<void> {
  const { db, vault } = deps;
  const { messageId, channel, provider, credentialId, to, subject, resolvedBody } = input;

  // Fetch the credential (tenant-scoped — vault also enforces this, but belt+braces).
  const [cred] = await db
    .select({ secretRef: providerCredentials.secretRef, config: providerCredentials.config })
    .from(providerCredentials)
    .where(
      and(
        eq(providerCredentials.id, credentialId),
        eq(providerCredentials.tenantId, tenantId),
      ),
    )
    .limit(1);
  if (!cred) {
    await db
      .update(messages)
      .set({ status: "failed", error: "credential not found" })
      .where(and(eq(messages.id, messageId), eq(messages.tenantId, tenantId)));
    return;
  }

  try {
    const secret = await vault.resolveSecret(cred.secretRef, tenantId);
    const adapter = getAdapter(channel, provider);
    const result = await adapter.send(
      { channel, to, subject, body: resolvedBody },
      { config: cred.config, secret },
    );

    await db
      .update(messages)
      .set({ status: "sent", providerMessageId: result.providerMessageId, sentAt: new Date() })
      .where(and(eq(messages.id, messageId), eq(messages.tenantId, tenantId)));

    await db.insert(usageEvents).values({ tenantId, channel, messageId });
  } catch (err) {
    const errorText = err instanceof Error ? err.message : String(err);
    await db
      .update(messages)
      .set({ status: "failed", error: errorText })
      .where(and(eq(messages.id, messageId), eq(messages.tenantId, tenantId)));
    throw err; // re-throw so BullMQ marks the job as failed and retries
  }
}
