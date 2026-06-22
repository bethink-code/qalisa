import type { Db } from "@qalisa/db";
import { messages } from "@qalisa/db/schema";
import type { Channel, MessageStatus } from "@qalisa/shared";
import { and, eq } from "drizzle-orm";
import type { Vault } from "../vault/vault";
import { dispatchMessage } from "./dispatchMessage";
import { prepareMessage } from "./prepareMessage";

export interface SendInput {
  channel: Channel;
  to: string;
  subject?: string;
  body?: string;
  templateId?: string;
  variables?: Record<string, string>;
  idempotencyKey?: string;
}

export interface SendOutput {
  messageId: string;
  providerMessageId: string | null;
  status: MessageStatus;
  error?: string;
}

/**
 * Synchronous end-to-end send: prepare (pre-checks + record) then dispatch
 * (vault + adapter + UsageEvent). Used in integration tests and retained for
 * direct use where BullMQ is not available. The async route uses prepareMessage
 * + enqueue instead.
 */
export async function sendMessage(
  tenantId: string,
  input: SendInput,
  deps: { db: Db; vault: Vault },
): Promise<SendOutput> {
  const prep = await prepareMessage(tenantId, input, deps);

  if (prep.status === "failed") {
    return { messageId: prep.messageId, providerMessageId: null, status: "failed", error: prep.error };
  }

  // Already processed (idempotency hit, credentialId is "").
  if (!prep.credentialId) {
    const [existing] = await deps.db
      .select({ status: messages.status, providerMessageId: messages.providerMessageId, error: messages.error })
      .from(messages)
      .where(and(eq(messages.id, prep.messageId), eq(messages.tenantId, tenantId)))
      .limit(1);
    return {
      messageId: prep.messageId,
      providerMessageId: existing?.providerMessageId ?? null,
      status: existing?.status ?? "queued",
      error: existing?.error ?? undefined,
    };
  }

  await dispatchMessage(tenantId, prep, deps);

  const [final] = await deps.db
    .select({ status: messages.status, providerMessageId: messages.providerMessageId, error: messages.error })
    .from(messages)
    .where(and(eq(messages.id, prep.messageId), eq(messages.tenantId, tenantId)))
    .limit(1);

  return {
    messageId: prep.messageId,
    providerMessageId: final?.providerMessageId ?? null,
    status: final?.status ?? "failed",
    error: final?.error ?? undefined,
  };
}
