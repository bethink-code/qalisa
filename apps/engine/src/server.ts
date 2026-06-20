import express, { type Express } from "express";
import { healthRouter } from "./routes/health";

/** Build the Express app. Routes are registered per-domain (brief §12). */
export function createServer(): Express {
  const app = express();
  app.use(express.json());

  app.use("/health", healthRouter);

  return app;
}
