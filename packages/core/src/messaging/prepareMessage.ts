import type { Db } from "@qalisa/db";
import {
  messages,
  providerCredentials,
  suppressions,
  templates,
  usageEvents,
} from "@qalisa/db/schema";
import type { Channel, MessageStatus, Provider } from "@qalisa/shared";
import { and, asc, eq, gte, sql } from "drizzle-orm";
import type { SendInput } from "./sendMessage";

export interface PrepareReady {
  status: "queued";
  /** Real status of an existing message on an idempotency hit — absent for fresh messages. */
  existingStatus?: MessageStatus;
  messageId: string;
  channel: Channel;
  provider: Provider;
  credentialId: string;
  to: string;
  subject?: string;
  resolvedBody: string;
}

export interface PrepareFailed {
  status: Extract<MessageStatus, "failed">;
  messageId: string;
  error: string;
}

export type PrepareResult = PrepareReady | PrepareFailed;

/**
 * Pre-flight for an outbound message: idempotency guard → credential lookup →
 * suppression check → rate-limit check → message record (queued) → template resolution.
 *
 * Throws (with statusCode) for precondition failures where no record is created
 * (no healthy credential, recipient suppressed, rate limit exceeded). Returns a
 * PrepareFailed for record-exists failures (template not found) so callers get a messageId back.
 */
export async function prepareMessage(
  tenantId: string,
  input: SendInput,
  deps: { db: Db; rateLimitPerMinute?: number },
): Promise<PrepareResult> {
  const { db } = deps;
  const { channel, to, subject, body, templateId, variables, idempotencyKey } = input;

  // Idempotency: short-circuit without creating a duplicate record.
  if (idempotencyKey) {
    const [existing] = await db
      .select({
        id: messages.id,
        status: messages.status,
        channel: messages.channel,
        provider: messages.provider,
      })
      .from(messages)
      .where(
        and(eq(messages.tenantId, tenantId), eq(messages.idempotencyKey, idempotencyKey)),
      )
      .limit(1);
    if (existing) {
      return {
        status: "queued",
        existingStatus: existing.status,
        messageId: existing.id,
        channel: existing.channel,
        provider: existing.provider,
        credentialId: "",   // signal: already handled, caller should not re-dispatch
        to,
        subject,
        resolvedBody: body ?? "",
      };
    }
  }

  // Deterministic credential pick: oldest-first gives stable primary/fallback behaviour.
  const [cred] = await db
    .select({ id: providerCredentials.id, provider: providerCredentials.provider })
    .from(providerCredentials)
    .where(
      and(
        eq(providerCredentials.tenantId, tenantId),
        eq(providerCredentials.channel, channel),
        eq(providerCredentials.status, "healthy"),
      ),
    )
    .orderBy(asc(providerCredentials.createdAt))
    .limit(1);
  if (!cred) {
    throw Object.assign(
      new Error(`No healthy credential configured for channel '${channel}'`),
      { statusCode: 422 },
    );
  }

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

  // Rolling rate limit — only checked when a limit is configured.
  if (deps.rateLimitPerMinute) {
    const oneMinuteAgo = new Date(Date.now() - 60_000);
    const [usage] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(usageEvents)
      .where(and(eq(usageEvents.tenantId, tenantId), gte(usageEvents.createdAt, oneMinuteAgo)));
    if ((usage?.count ?? 0) >= deps.rateLimitPerMinute) {
      throw Object.assign(
        new Error(`Rate limit exceeded: ${deps.rateLimitPerMinute} messages per minute`),
        { statusCode: 429 },
      );
    }
  }

  const [msg] = await db
    .insert(messages)
    .values({
      tenantId,
      channel,
      provider: cred.provider,
      to,
      body: body ?? null,
      templateId: templateId ?? null,
      status: "queued",
      idempotencyKey: idempotencyKey ?? null,
    })
    .onConflictDoNothing()
    .returning({ id: messages.id });

  if (!msg) {
    // Concurrent insert with same idempotency key — fetch the winner's record.
    if (idempotencyKey) {
      const [existing] = await db
        .select({ id: messages.id, status: messages.status, channel: messages.channel, provider: messages.provider })
        .from(messages)
        .where(and(eq(messages.tenantId, tenantId), eq(messages.idempotencyKey, idempotencyKey)))
        .limit(1);
      if (existing) {
        return {
          status: "queued",
          existingStatus: existing.status,
          messageId: existing.id,
          channel: existing.channel,
          provider: existing.provider,
          credentialId: "",
          to,
          subject,
          resolvedBody: body ?? "",
        };
      }
    }
    throw new Error("Failed to create message record");
  }
  const messageId = msg.id;

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
      return { status: "failed", messageId, error: "template not found" };
    }
    resolvedBody = renderTemplate(tmpl.body, variables ?? {});
  }

  return {
    status: "queued",
    messageId,
    channel,
    provider: cred.provider,
    credentialId: cred.id,
    to,
    subject,
    resolvedBody,
  };
}

/** Replace {{variable}} placeholders in template body. Unresolved keys pass through. */
export function renderTemplate(body: string, variables: Record<string, string>): string {
  return body.replace(/\{\{(\w+)\}\}/g, (_, key: string) => variables[key] ?? `{{${key}}}`);
}
