import { getAdapter } from "@qalisa/adapters";
import type { Db } from "@qalisa/db";
import {
  messages,
  providerCredentials,
  suppressions,
  templates,
  usageEvents,
} from "@qalisa/db/schema";
import type { Channel, MessageStatus } from "@qalisa/shared";
import { and, eq } from "drizzle-orm";
import type { Vault } from "../vault/vault";

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
 * Core send orchestration: idempotency guard → credential lookup →
 * suppression check → message record → template resolution → adapter.send()
 * → UsageEvent. Throws (with statusCode) for precondition failures.
 * Returns a "failed" SendOutput for adapter-level errors so the caller
 * always gets a message record back.
 */
export async function sendMessage(
  tenantId: string,
  input: SendInput,
  deps: { db: Db; vault: Vault },
): Promise<SendOutput> {
  const { db, vault } = deps;
  const { channel, to, subject, body, templateId, variables, idempotencyKey } = input;

  // Idempotency: return the existing record without re-sending.
  if (idempotencyKey) {
    const [existing] = await db
      .select({
        id: messages.id,
        status: messages.status,
        providerMessageId: messages.providerMessageId,
        error: messages.error,
      })
      .from(messages)
      .where(
        and(eq(messages.tenantId, tenantId), eq(messages.idempotencyKey, idempotencyKey)),
      )
      .limit(1);
    if (existing) {
      return {
        messageId: existing.id,
        providerMessageId: existing.providerMessageId ?? null,
        status: existing.status,
        error: existing.error ?? undefined,
      };
    }
  }

  // Require a healthy credential for the requested channel.
  const [cred] = await db
    .select()
    .from(providerCredentials)
    .where(
      and(
        eq(providerCredentials.tenantId, tenantId),
        eq(providerCredentials.channel, channel),
        eq(providerCredentials.status, "healthy"),
      ),
    )
    .limit(1);
  if (!cred) {
    throw Object.assign(
      new Error(`No healthy credential configured for channel '${channel}'`),
      { statusCode: 422 },
    );
  }

  // Suppression check — must never send to suppressed recipients.
  const [suppressed] = await db
    .select({ id: suppressions.id })
    .from(suppressions)
    .where(
      and(
        eq(suppressions.tenantId, tenantId),
        eq(suppressions.channel, channel),
        eq(suppressions.identifier, to),
      ),
    )
    .limit(1);
  if (suppressed) {
    throw Object.assign(
      new Error(`Recipient '${to}' is suppressed on channel '${channel}'`),
      { statusCode: 422 },
    );
  }

  // Create the message in "queued" state. Everything from here has a record.
  const [msg] = await db
    .insert(messages)
    .values({
      tenantId,
      channel,
      provider: cred.provider,
      to,
      templateId: templateId ?? null,
      status: "queued",
      idempotencyKey: idempotencyKey ?? null,
    })
    .returning({ id: messages.id });
  if (!msg) throw new Error("Failed to create message record");
  const messageId = msg.id;

  // Resolve body from template when templateId is provided.
  let resolvedBody = body ?? "";
  if (templateId) {
    const [tmpl] = await db
      .select({ body: templates.body })
      .from(templates)
      .where(and(eq(templates.id, templateId), eq(templates.tenantId, tenantId)))
      .limit(1);
    if (!tmpl) {
      await db
        .update(messages)
        .set({ status: "failed", error: "template not found" })
        .where(and(eq(messages.id, messageId), eq(messages.tenantId, tenantId)));
      return { messageId, providerMessageId: null, status: "failed", error: "template not found" };
    }
    resolvedBody = renderTemplate(tmpl.body, variables ?? {});
  }

  // Dispatch to adapter. Any adapter error marks the record "failed" and returns.
  try {
    const secret = await vault.resolveSecret(cred.secretRef, tenantId);
    const adapter = getAdapter(channel, cred.provider);
    const result = await adapter.send(
      { channel, to, subject, body: resolvedBody, templateId, variables },
      { config: cred.config, secret },
    );

    await db
      .update(messages)
      .set({ status: "sent", providerMessageId: result.providerMessageId, sentAt: new Date() })
      .where(and(eq(messages.id, messageId), eq(messages.tenantId, tenantId)));

    await db.insert(usageEvents).values({ tenantId, channel, messageId });

    return { messageId, providerMessageId: result.providerMessageId, status: "sent" };
  } catch (err) {
    const errorText = err instanceof Error ? err.message : String(err);
    await db
      .update(messages)
      .set({ status: "failed", error: errorText })
      .where(and(eq(messages.id, messageId), eq(messages.tenantId, tenantId)));
    return { messageId, providerMessageId: null, status: "failed", error: errorText };
  }
}

/** Replace {{variable}} placeholders in template body. Unresolved keys pass through. */
function renderTemplate(body: string, variables: Record<string, string>): string {
  return body.replace(/\{\{(\w+)\}\}/g, (_, key: string) => variables[key] ?? `{{${key}}}`);
}
