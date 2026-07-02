---
created: 2026-04-07T00:00:00Z
last_updated: 2026-06-29T00:00:00Z
version: 1.1
author: Claude Code PM System
---

# System Patterns — Genfeed.ai

## Architecture Patterns

### Multi-Tenancy (Enterprise Only)

Multi-tenant organization isolation is an enterprise feature. Enforcement currently lives in the OSS API: the global `CombinedAuthGuard` (APP_GUARD, `apps/server/api/src/helpers/guards/combined-auth/`) enforces org-scoped access and tenant queries include `{ organizationId, isDeleted: false }`. Use `@Public()` to opt out of auth. `ee/packages/multi-tenancy/` is a Phase C extraction scaffold (issue #87) — the code has not moved there yet.

Single-tenant (default self-hosted) deployments do NOT require `organization` in queries — only `{ isDeleted: false }`.

### Serializer Pipeline
DB Record -> Serializer -> Client Response. Never return raw Prisma records.
- File triplet: `{name}.attributes.ts` + `{name}.config.ts` + `{name}.serializer.ts`
- Attributes use `createEntityAttributes()` (auto-adds timestamps + isDeleted)
- Configs use `simpleConfig()` or spread `STANDARD_ENTITY_RELS` / `CONTENT_ENTITY_RELS`
- Server serializers use `buildSerializer('server', config)`

### Service Module Factory
Backend modules use `createServiceModule()` factory (auto-includes ConfigModule + LoggerModule). Circular deps use `forwardRef(() => Module)`.

### Soft Deletes
`isDeleted: boolean` field — never `deletedAt`. All queries filter `isDeleted: false`.

### Queue Processing And Scheduling
BullMQ queues use Redis. Product-facing recurring automation is workflow-backed through `WorkflowSchedulerService` and workflow trigger records. The legacy `cron-jobs` subsystem is retained for compatibility reads and workflow-adapter execution of migrated rows; do not add new product features to it. Static Nest `@Cron(...)` jobs are reserved for reviewed platform/maintenance responsibilities and are guarded by `bun run check:cron-boundary`.

## Frontend Patterns

### Page Structure (Website)
- `page.tsx` (server component): `createPageMetadataWithCanonical()` + `Suspense` + `LazyLoadingFallback`
- `content.tsx` (client component): `PageLayout` wrapper with actual UI

### Premium Pages
Use `gen-*` design classes (`gen-card-spotlight`, `gen-contact-sheet`, `gen-divider-accent`, `gen-vignette`, `gen-grain`) instead of generic `Card`.

### Component Conventions
- `function` declarations (not arrow), default export
- AbortController in every useEffect with async calls
- Card sizing via `size` prop, padding in `bodyClassName`
- Navigation = `Link` semantics, Actions = `Button` semantics

### GSAP Animations
`useGsapEntrance({ animations })` with `gsapPresets.fadeUp`, `gsapPresets.staggerCards`

## Backend Patterns

### Config Access
`ConfigService` via `{ provide: ConfigService, useValue: new ConfigService() }` — never `process.env` directly.

### Integration Services
- Module: `createServiceModule()` factory
- OAuth: `@Post('connect')` -> auth URL, `@Post('verify')` -> exchange code
- Credentials scoped: `{ platform: CredentialPlatform.X, isDeleted: false }` (add `organizationId` only with enterprise multi-tenancy)

### Agent Tools
- Registration chain: tool def -> credit cost -> agent type config -> executor handler -> UI label -> test
- Names: snake_case
- Read-only tools in `SHARED_READ_TOOLS`; specialized in specific `AgentType` configs

## Data Patterns

### Credits System (Enterprise)
Billing providers live in `ee/packages/billing/`, wired into the API via the webpack `@billing-providers` alias (OSS builds get the stubs in `apps/server/api/src/common/subscriptions/billing.providers.oss.ts`). Credits collections/controllers live in the OSS API (`apps/server/api/src/collections/credits/`). Single balance pool per org. Transactions tracked with `source` field.

### Indexes
Indexes are defined in `packages/prisma/prisma/schema.prisma` via `@@index` directives on each model.
