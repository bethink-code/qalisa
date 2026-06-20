import { pino } from "pino";

/**
 * Shared structured logger. Redaction is defence-in-depth: secret material is
 * already wrapped in `Secret` (which redacts on serialize), but we also censor
 * common secret-bearing paths here so a stray `logger.info({ secret })` can't
 * leak. Never log raw request bodies for credential endpoints.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: {
    paths: [
      "secret",
      "*.secret",
      "password",
      "*.password",
      "apiKey",
      "*.apiKey",
      "key",
      "*.key",
      "authorization",
      "*.authorization",
      "req.headers.authorization",
      "headers.authorization",
    ],
    censor: "[REDACTED]",
  },
});
