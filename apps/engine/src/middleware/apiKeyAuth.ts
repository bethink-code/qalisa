import { hashApiKey } from "@qalisa/core";
import { apiKeys, db } from "@qalisa/db";
import { and, eq, isNull } from "drizzle-orm";
import type { RequestHandler } from "express";
import { asyncHandler } from "./asyncHandler";

/**
 * Resolves the tenant from a hashed API key. Looks up by hash (never the raw
 * key) and rejects revoked keys. On success sets req.tenantId / req.apiKeyId.
 */
export const apiKeyAuth: RequestHandler = asyncHandler(async (req, res, next) => {
  const header = req.header("authorization");
  if (!header || !header.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or malformed API key" });
    return;
  }

  const raw = header.slice("Bearer ".length).trim();
  const [key] = await db
    .select({ id: apiKeys.id, tenantId: apiKeys.tenantId })
    .from(apiKeys)
    .where(and(eq(apiKeys.keyHash, hashApiKey(raw)), isNull(apiKeys.revokedAt)))
    .limit(1);

  if (!key) {
    res.status(401).json({ error: "Invalid API key" });
    return;
  }

  req.tenantId = key.tenantId;
  req.apiKeyId = key.id;
  // Best-effort last-used stamp; not awaited so it never delays the request.
  void db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, key.id));
  next();
});
