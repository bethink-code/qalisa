import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index";

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL is required");
}

const queryClient = postgres(url);

export const db = drizzle(queryClient, { schema, casing: "snake_case" });
export type Db = typeof db;
