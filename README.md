# Qalisa

A multi-tenant communications engine — bulk and triggered **email, SMS, and WhatsApp**.
One engine, two faces: a subscription product (campaign UI) and an embedded API for
Bethink's other TimeShift apps. Both are consumers of the same core; there is no
"internal" vs "external" version, and **no special-casing of any tenant** (Bethink is
just another tenant row).

> _Qalisa_ (isiZulu): *to initiate, to set in motion*.

## Stack

TypeScript end-to-end, pnpm + Turborepo monorepo.

| Layer | Choice |
|---|---|
| Engine API | Express + Zod |
| Product UI | React + Vite |
| DB | PostgreSQL + Drizzle (self-hosted) |
| Queue | BullMQ on Redis _(from Phase 6)_ |
| Vault | libsodium envelope encryption, master key from env _(from Phase 1)_ |
| Tests | Vitest + Playwright |

## Layout

```
apps/
  engine/    Express API: send, admin, webhooks
  web/       React product UI + onboarding
packages/
  shared/    Zod schemas, canonical enums, shared types
  db/        Drizzle schema + migrations + client
  core/      domain logic: tenancy, vault, compliance, pipeline  (Phase 1+)
  adapters/  mailgun, smsportal, meta channel adapters           (Phase 2+)
infra/       docker-compose (postgres, redis), env templates
```

## Getting started

```bash
# 1. Install deps
pnpm install

# 2. Configure env
cp .env.example .env          # then set VAULT_MASTER_KEY etc.

# 3. Start datastores (Postgres + Redis)
pnpm infra:up

# 4. Apply DB migrations
pnpm db:generate              # generate SQL from the Drizzle schema
pnpm db:migrate               # apply to the database

# 5. Run engine + web
pnpm dev
```

- Engine: http://localhost:4000 — health check at `/health`
- Web: http://localhost:3000

## Useful scripts

| Command | Purpose |
|---|---|
| `pnpm dev` | Run engine + web (turbo) |
| `pnpm build` | Build all packages/apps |
| `pnpm typecheck` | Typecheck the workspace |
| `pnpm test` | Run Vitest across the workspace |
| `pnpm db:generate` / `db:migrate` / `db:push` / `db:studio` | Drizzle migration tooling |
| `pnpm infra:up` / `infra:down` | Start / stop Postgres + Redis |

## Build phases

Engine-first, then the product UI on top. See the build brief for definition-of-done
per phase. Current: **Phase 0 — Scaffold**.
