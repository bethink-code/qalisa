import express, { type Express } from "express";
import { adminAuth } from "./middleware/adminAuth";
import { apiKeyAuth } from "./middleware/apiKeyAuth";
import { errorHandler, notFoundHandler } from "./middleware/errors";
import { credentialsRouter } from "./routes/credentials";
import { healthRouter } from "./routes/health";
import { messagesRouter } from "./routes/messages";
import { tenantsRouter } from "./routes/tenants";
import { templatesRouter } from "./routes/templates";
import { webhooksRouter } from "./routes/webhooks";

/** Build the Express app. Routes are registered per-domain (brief §12). */
export function createServer(): Express {
  const app = express();
  app.use(
    express.json({
      verify: (req, _res, buf) => {
        (req as Express.Request).rawBody = buf;
      },
    }),
  );

  app.use("/health", healthRouter);
  // Admin-token guarded: platform provisioning.
  app.use("/v1/tenants", adminAuth, tenantsRouter);
  // API-key guarded: tenant-scoped operations.
  app.use("/v1/credentials", apiKeyAuth, credentialsRouter);
  app.use("/v1/messages", apiKeyAuth, messagesRouter);
  app.use("/v1/templates", apiKeyAuth, templatesRouter);
  // Webhook routes: no bearer auth — provider-signed payloads, tenant via URL.
  app.use("/v1/webhooks", webhooksRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
