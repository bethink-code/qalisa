import { env } from "./env";
import { createServer } from "./server";

const app = createServer();

app.listen(env.ENGINE_PORT, env.ENGINE_HOST, () => {
  // Structured logging (pino) arrives in Phase 1; a single boot line is fine here.
  console.log(`[engine] listening on http://${env.ENGINE_HOST}:${env.ENGINE_PORT}`);
});
