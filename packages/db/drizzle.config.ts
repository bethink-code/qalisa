import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { defineConfig } from "drizzle-kit";

// drizzle-kit runs from packages/db; load the single root .env.
const here = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(here, "../../.env") });

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL is required to run drizzle-kit (set it in .env)");
}

export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  casing: "snake_case",
  dbCredentials: { url },
});
