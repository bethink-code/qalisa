import { db } from "@qalisa/db";
import { sql } from "drizzle-orm";
import { Router } from "express";

export const healthRouter: Router = Router();

healthRouter.get("/", async (_req, res) => {
  try {
    await db.execute(sql`select 1`);
    res.json({ status: "ok", db: "up" });
  } catch {
    res.status(503).json({ status: "degraded", db: "down" });
  }
});
