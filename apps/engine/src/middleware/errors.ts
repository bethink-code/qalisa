import { logger } from "@qalisa/core";
import type { NextFunction, Request, Response } from "express";

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: "Not found" });
}

/**
 * Last-resort error handler. Logs the error server-side (pino redacts secret
 * paths) and returns a generic message — never leaks internals to the client.
 */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  logger.error({ err }, "unhandled request error");
  res.status(500).json({ error: "Internal server error" });
}
