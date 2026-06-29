import { db } from "@qalisa/db";
import { tenants } from "@qalisa/db/schema";
import { eq } from "drizzle-orm";
import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler";

export const meRouter: Router = Router();

// GET /v1/me — returns the current tenant's id and name.
meRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const [tenant] = await db
      .select({ id: tenants.id, name: tenants.name })
      .from(tenants)
      .where(eq(tenants.id, req.tenantId!))
      .limit(1);
    if (!tenant) { res.status(404).json({ error: "Tenant not found" }); return; }
    res.json(tenant);
  }),
);
