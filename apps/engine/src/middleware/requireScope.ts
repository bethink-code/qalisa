import type { RequestHandler } from "express";

/**
 * Scope enforcement middleware. Keys with empty scopes have full access
 * (backward compatible with all existing keys). Keys with explicit scopes
 * must include the required scope or the request is rejected with 403.
 */
export function requireScope(scope: string): RequestHandler {
  return (req, res, next) => {
    const scopes = req.scopes ?? [];
    if (scopes.length > 0 && !scopes.includes(scope)) {
      res.status(403).json({ error: `Scope '${scope}' required` });
      return;
    }
    next();
  };
}
