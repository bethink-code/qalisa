import type { Db } from "@qalisa/db";
import { tenants, users } from "@qalisa/db/schema";

export interface CreateTenantInput {
  name: string;
  ownerEmail: string;
}

export interface CreateTenantResult {
  tenant: typeof tenants.$inferSelect;
  owner: typeof users.$inferSelect;
}

/**
 * Create a tenant and its owner user atomically. Bethink onboards through this
 * exact path like any other tenant — there is no special-cased seed (brief §1).
 */
export async function createTenant(db: Db, input: CreateTenantInput): Promise<CreateTenantResult> {
  return db.transaction(async (tx) => {
    const [tenant] = await tx.insert(tenants).values({ name: input.name }).returning();
    if (!tenant) {
      throw new Error("Failed to create tenant");
    }
    const [owner] = await tx
      .insert(users)
      .values({ tenantId: tenant.id, email: input.ownerEmail, role: "owner" })
      .returning();
    if (!owner) {
      throw new Error("Failed to create owner user");
    }
    return { tenant, owner };
  });
}
