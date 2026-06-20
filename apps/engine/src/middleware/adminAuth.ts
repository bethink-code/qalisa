import { safeEqual } from "@qalisa/core";
import type { NextFunction, Request, Response } from "express";
import { env } from "../env";

/**
 * Guards platform-admin provisioning (creating tenants + API keys). Accepts the
 * admin token via `Authorization: Bearer <token>` or `X-Admin-Token`. The Phase 7
 * UI will sit on top of these operations via session auth.
 */
export function adminAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.header("authorization");
  const bearer = header?.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : undefined;
  const token = bearer ?? req.header("x-admin-token");

  if (!token || !safeEqual(token, env.ADMIN_API_TOKEN)) {
    res.status(401).json({ error: "Admin authentication required" });
    return;
  }

  req.isAdmin = true;
  next();
}
