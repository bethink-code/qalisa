# Code review — issues & risks

Findings from a full read-through of the codebase. Ordered by severity within each
section. Resolved items are struck through; the resolution and where it was fixed
are noted.

---

## Critical — production-blocking

### 1. ~~Worker not deployed to Railway~~ — RESOLVED

The worker is now a second Railway service. `tsup.config.ts` builds `worker.ts`
as a second entry, and `railway.worker.toml` starts it:

```
startCommand = "node apps/engine/dist/worker.js"
```

### 2. ~~SMSPortal webhooks unauthenticated~~ — RESOLVED

Webhook URL now includes a random `:secret` path segment generated at credential
creation time (`/v1/webhooks/smsportal/:tenantId/:secret`). The route verifies
the secret against the stored value before parsing. Mailjet has the same fix.

---

## Notable

### 3. ~~Mailgun & Meta webhooks silently fall back to "no verification"~~ — RESOLVED

Both adapters now hard-throw when the signing secret is absent.

### 4. ~~No timeout on any provider `fetch`~~ — RESOLVED

All adapters pass `AbortSignal.timeout()` — 10s for health checks, 15s for sends.

### 5. ~~Idempotency is check-then-insert, not atomic~~ — RESOLVED

`prepareMessage.ts` uses `onConflictDoNothing().returning()` and re-fetches the
winner's record on conflict.

### 6. ~~No replay protection on Mailgun webhooks~~ — RESOLVED

`mailgun.ts` rejects timestamps outside ±15 minutes.

### 7. ~~`updateDelivery` has no status monotonicity~~ — RESOLVED

WHERE clause excludes terminal statuses via `notInArray(["delivered","failed"])`.

### 8. ~~CI never runs the integration tests~~ — RESOLVED

`ci.yml` sets `TEST_DATABASE_URL` and runs `verify-phase1.ts`.

### 9. ~~No graceful shutdown~~ — RESOLVED

Both `index.ts` and `worker.ts` trap `SIGTERM`.

### 10. ~~Missing index on `messages(tenant_id, created_at)`~~ — RESOLVED

Index exists: `messages_tenant_id_created_at_idx`.

### 11. ~~Idempotent retries misreport status~~ — RESOLVED

Idempotency branch now reads `existing.status` and returns it as `existingStatus`
on `PrepareReady`. `POST /v1/messages` surfaces the real status to callers.

### 12. ~~API keys issued for suspended tenants~~ — RESOLVED

`POST /v1/tenants/:id/api-keys` rejects when `status === "suspended"`. `apiKeyAuth`
also rejects keys whose tenant is `suspended`. `setup` tenants can receive keys
(normal provisioning flow — admin creates tenant, issues key, tenant completes setup).

### 13. ~~`scopes` not enforced~~ — RESOLVED

`requireScope` middleware exists and is wired to `POST /v1/messages`. Keys with
empty scopes retain full access (backward compatible).

### 14. ~~No rate limiting~~ — RESOLVED

Rolling per-minute rate limit enforced in `prepareMessage` via `usageEvents`
count. Configured via `RATE_LIMIT_PER_TENANT_PER_MINUTE` env var.

### 15. ~~Non-deterministic provider pick~~ — RESOLVED

`.orderBy(asc(providerCredentials.createdAt))` gives stable primary/fallback
behaviour across requests.

### 16. No master-key rotation tooling — OPEN

The envelope design supports rotation, but no script re-wraps DEKs under a new
master key. Add before you need it.

---

## Minor

| # | Issue | Status | Where |
|---|---|---|---|
| 17 | ~~`templates.ts` GET casts `channelFilter` unchecked~~ | RESOLVED | `templates.ts` GET |
| 18 | Template variables not validated — unresolved keys pass through silently | OPEN | `prepareMessage.ts` |
| 19 | `tenants.planId` dangling column — no `plans` table, no FK | OPEN | `tenancy.ts` |
| 20 | ~~`apiKeyAuth` fire-and-forget `lastUsedAt` write~~ | RESOLVED | `apiKeyAuth.ts` |
| 21 | `rawBody` captured on every request — cosmetic perf concern for bulk send | OPEN | `server.ts` |
| 22 | `renderTemplate` does no HTML escaping — matters when HTML bodies are added | OPEN | `prepareMessage.ts` |

---

## What's working well

- **`Secret` wrapper** with redacting `toString`/`toJSON` plus pino redaction paths.
- **Envelope encryption** with a versioned blob (`v: 1`) — forward-compatible, rotation-ready.
- **`ChannelAdapter` interface + `getAdapter` registry** — adding a provider touches only this package + the registry.
- **Canonical enums in `shared`** consumed by both Drizzle and Zod.
- **Tenant scoping on every vault read** — correct "last line of defence."
- **`onConflictDoNothing` + terminal-status guard** — idempotency and monotonic delivery correct at the DB layer.
- **`prepareMessage` → enqueue → `dispatchMessage` split**, with sync `sendMessage` for tests.
- **`verify-phase1.ts`** — end-to-end smoke test including plaintext-never-reaches-DB assertion.
