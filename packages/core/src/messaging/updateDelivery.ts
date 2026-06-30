import type { DeliveryEvent } from "@qalisa/adapters";
import type { Db } from "@qalisa/db";
import { messages } from "@qalisa/db/schema";
import type { MessageStatus } from "@qalisa/shared";
import { and, eq, notInArray } from "drizzle-orm";

/** Apply a normalised delivery event from a provider webhook to the message record.
 *
 * No-downgrade: each status can only advance the record, never go backwards.
 * Priority order: queued < sent < delivered < read; failed is terminal.
 */
export async function updateDelivery(
  tenantId: string,
  event: DeliveryEvent,
  deps: { db: Db },
): Promise<void> {
  const { db } = deps;

  // Statuses that must not be overwritten by the incoming event.
  const doNotOverwrite: MessageStatus[] =
    event.status === "read" ? ["read", "failed"]
    : event.status === "delivered" ? ["read", "failed"]
    : ["delivered", "read", "failed"];

  await db
    .update(messages)
    .set({
      status: event.status,
      ...(event.status === "delivered" ? { deliveredAt: new Date() } : {}),
      ...(event.status === "read" ? { readAt: new Date() } : {}),
    })
    .where(
      and(
        eq(messages.tenantId, tenantId),
        eq(messages.providerMessageId, event.providerMessageId),
        notInArray(messages.status, doNotOverwrite),
      ),
    );
}
