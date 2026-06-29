import { hashApiKey } from "@qalisa/core";
import { apiKeys, db, tenants } from "@qalisa/db";
import { and, eq, isNull } from "drizzle-orm";
import type { RequestHandler } from "express";
import { asyncHandler } from "./asyncHandler";

/**
 * Resolves the tenant from a hashed API key. Looks up by hash (never the raw
 * key), rejects revoked keys, and rejects keys whose tenant is suspended.
 * On success sets req.tenantId / req.apiKeyId / req.scopes.
 */
export const apiKeyAuth: RequestHandler = asyncHandler(async (req, res, next) => {
  const header = req.header("authorization");
  if (!header || !header.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or malformed API key" });
    return;
  }

  const raw = header.slice("Bearer ".length).trim();
  const [key] = await db
    .select({ id: apiKeys.id, tenantId: apiKeys.tenantId, scopes: apiKeys.scopes, tenantStatus: tenants.status })
    .from(apiKeys)
    .innerJoin(tenants, eq(apiKeys.tenantId, tenants.id))
    .where(and(eq(apiKeys.keyHash, hashApiKey(raw)), isNull(apiKeys.revokedAt)))
    .limit(1);

  if (!key) {
    res.status(401).json({ error: "Invalid API key" });
    return;
  }

  if (key.tenantStatus === "suspended") {
    res.status(403).json({ error: "Account suspended" });
    return;
  }

  req.tenantId = key.tenantId;
  req.apiKeyId = key.id;
  req.scopes = key.scopes;
  // Best-effort last-used stamp; not awaited so it never delays the request.
  void db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, key.id)).catch(() => {});
  next();
});
