/**
 * Phase 1 end-to-end verification. Boots the engine in-process, runs the full
 * provisioning + credential flow, and asserts no plaintext secret reaches the DB.
 * Run:  node node_modules/tsx/dist/cli.mjs apps/engine/scripts/verify-phase1.ts
 */
// env first: loads .env into process.env before @qalisa/db instantiates its client.
import { env } from "../src/env";
import { db, secrets } from "@qalisa/db";
import { tenants } from "@qalisa/db/schema";
import { eq } from "drizzle-orm";
import { createServer } from "../src/server";

const NEEDLE = "mg-PLAINTEXT-NEEDLE-9981";
let failures = 0;
const check = (label: string, ok: boolean, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${extra ? ` — ${extra}` : ""}`);
  if (!ok) failures++;
};

async function main() {
  const server = createServer().listen(0);
  const addr = server.address();
  if (!addr || typeof addr === "string") {
    throw new Error("Failed to bind an ephemeral port");
  }
  const base = `http://127.0.0.1:${addr.port}`;
  const adminHdr = { Authorization: `Bearer ${env.ADMIN_API_TOKEN}`, "Content-Type": "application/json" };
  let tenantId = "";

  try {
    // 1. admin auth required
    const noAuth = await fetch(`${base}/v1/tenants`, { method: "POST", body: "{}" });
    check("create tenant without admin token is rejected", noAuth.status === 401, `status ${noAuth.status}`);

    // 2. create tenant
    const tRes = await fetch(`${base}/v1/tenants`, {
      method: "POST",
      headers: adminHdr,
      body: JSON.stringify({ name: "Bethink", ownerEmail: "garth@bethink.co.za" }),
    });
    const tenant = await tRes.json();
    tenantId = tenant.tenant?.id ?? "";
    check("tenant created (status=setup, owner role)", tRes.status === 201 && tenant.tenant?.status === "setup" && tenant.owner?.role === "owner");

    // 3. issue api key
    const kRes = await fetch(`${base}/v1/tenants/${tenantId}/api-keys`, {
      method: "POST",
      headers: adminHdr,
      body: JSON.stringify({ label: "engine-key" }),
    });
    const keyResp = await kRes.json();
    const apiKey: string = keyResp.key ?? "";
    check("api key issued (prefixed, returned once)", kRes.status === 201 && apiKey.startsWith("qal_"));

    const keyHdr = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };

    // 4. api key required
    const noKey = await fetch(`${base}/v1/credentials`, { method: "POST", body: "{}" });
    check("store credential without api key is rejected", noKey.status === 401, `status ${noKey.status}`);

    // 5. store credential
    const cRes = await fetch(`${base}/v1/credentials`, {
      method: "POST",
      headers: keyHdr,
      body: JSON.stringify({ channel: "email", provider: "mailgun", config: { domain: "mg.bethink.co.za" }, secret: NEEDLE }),
    });
    const cred = await cRes.json();
    const credId: string = cred.id ?? "";
    check("credential stored, response carries NO secret", cRes.status === 201 && !("secret" in cred) && !("secretRef" in cred));

    // 6. health check — fake creds will be rejected by Mailgun; verify the endpoint responds and records a result.
    const testRes = await fetch(`${base}/v1/credentials/${credId}/test`, { method: "POST", headers: keyHdr });
    const test = await testRes.json();
    check("test-connection responds and records status", testRes.status === 200 && (test.status === "healthy" || test.status === "failing"), `status=${test.status} detail=${test.detail ?? ""}`);

    // 7. list
    const listRes = await fetch(`${base}/v1/credentials`, { headers: keyHdr });
    const list = await listRes.json();
    check("list returns the credential without secrets", Array.isArray(list) && list.length === 1 && !("secretRef" in list[0]));

    // 8. DB: no plaintext anywhere; ciphertext present
    const rows = await db.select({ ciphertext: secrets.ciphertext }).from(secrets).where(eq(secrets.tenantId, tenantId));
    const anyPlaintext = rows.some((r) => r.ciphertext.includes(NEEDLE));
    check("DB stores ciphertext, never the plaintext secret", rows.length === 1 && !anyPlaintext);
    console.log(`      ciphertext sample: ${rows[0]?.ciphertext.slice(0, 64)}…`);
  } finally {
    if (tenantId) await db.delete(tenants).where(eq(tenants.id, tenantId)); // clean up dev DB
    server.close();
  }

  console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
