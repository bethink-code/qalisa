import { env } from "./env";
import { createServer } from "./server";

const app = createServer();

const server = app.listen(env.ENGINE_PORT, env.ENGINE_HOST, () => {
  console.log(`[engine] listening on http://${env.ENGINE_HOST}:${env.ENGINE_PORT}`);
});

process.on("SIGTERM", () => {
  console.log("[engine] SIGTERM received, shutting down");
  server.close(() => {
    console.log("[engine] HTTP server closed");
    process.exit(0);
  });
});
