import type { DeliveryEvent } from "@qalisa/adapters";
import type { Db } from "@qalisa/db";
import { messages } from "@qalisa/db/schema";
import { and, eq, notInArray } from "drizzle-orm";

/** Apply a normalised delivery event from a provider webhook to the message record. */
export async function updateDelivery(
  tenantId: string,
  event: DeliveryEvent,
  deps: { db: Db },
): Promise<void> {
  const { db } = deps;

  await db
    .update(messages)
    .set({
      status: event.status,
      ...(event.status === "delivered" ? { deliveredAt: new Date() } : {}),
    })
    .where(
      and(
        eq(messages.tenantId, tenantId),
        eq(messages.providerMessageId, event.providerMessageId),
        notInArray(messages.status, ["delivered", "failed"]),
      ),
    );
}
