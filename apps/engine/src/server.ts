import express, { type Express } from "express";
import { adminAuth } from "./middleware/adminAuth";
import { apiKeyAuth } from "./middleware/apiKeyAuth";
import { errorHandler, notFoundHandler } from "./middleware/errors";
import { credentialsRouter } from "./routes/credentials";
import { healthRouter } from "./routes/health";
import { tenantsRouter } from "./routes/tenants";

/** Build the Express app. Routes are registered per-domain (brief §12). */
export function createServer(): Express {
  const app = express();
  app.use(express.json());

  app.use("/health", healthRouter);
  // Admin-token guarded: platform provisioning.
  app.use("/v1/tenants", adminAuth, tenantsRouter);
  // API-key guarded: tenant-scoped operations.
  app.use("/v1/credentials", apiKeyAuth, credentialsRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
