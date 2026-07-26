# System Patterns — Genfeed.ai

**last_verified: 2026-07-26** · Auto-loaded every request. Patterns only — the flat rules
(no `any`, no `console.log`, `isDeleted` soft deletes, `ConfigService` over `process.env`,
`@ui/primitives` over raw HTML) live in CLAUDE.md and are not repeated here.

## Backend

**Serializer triplet** — `{name}.attributes.ts` + `{name}.config.ts` + `{name}.serializer.ts`.
Attributes via `createEntityAttributes()` (adds timestamps + `isDeleted`); configs via
`simpleConfig()` or spreading `STANDARD_ENTITY_RELS` / `CONTENT_ENTITY_RELS`; server serializers
via `buildSerializer('server', config)`. Never return a raw Prisma record.

**Modules** — `createServiceModule()` factory (pulls in ConfigModule + LoggerModule).
Circular deps use `forwardRef(() => Module)`.

**Multi-tenancy** — an EE/SaaS *product* boundary, enforced in the OSS API by design: the global
`CombinedAuthGuard` (APP_GUARD, `apps/server/api/src/helpers/guards/combined-auth/`) plus inline
`{ organizationId, isDeleted: false }` filters. `@Public()` opts out of auth. No
`ee/packages/multi-tenancy` package exists and none should — resolved in #1093. Single-tenant
self-hosted needs only `{ isDeleted: false }`.

**Scheduling** — product-facing recurring automation is workflow-backed via
`WorkflowSchedulerService` + workflow trigger records. Legacy `cron-jobs` is compatibility-only;
add nothing new to it. Static `@Cron(...)` is reserved for reviewed platform/maintenance jobs and
is guarded by `bun run check:cron-boundary`.

**Integrations** — `createServiceModule()`; `@Post('connect')` returns the auth URL,
`@Post('verify')` exchanges the code. Credentials scoped
`{ platform: CredentialPlatform.X, isDeleted: false }` (+ `organizationId` under EE multi-tenancy).

**Agent tools** — registration chain is: tool def → credit cost → agent type config → executor
handler → UI label → test. Read-only tools go in `SHARED_READ_TOOLS`; the rest in the specific
`AgentType` config.

**Credits** — billing providers in `ee/packages/billing/` via the webpack `@billing-providers`
alias (OSS resolves `apps/server/api/src/common/subscriptions/billing.providers.oss.ts`). Credits
collections/controllers stay OSS at `apps/server/api/src/collections/credits/`. One balance pool
per org; transactions carry `source`. Indexes are `@@index` in `packages/prisma/prisma/schema.prisma`.

## Frontend

**Page split** — `page.tsx` server component does `createPageMetadataWithCanonical()` + `Suspense`
+ `LazyLoadingFallback`; `content.tsx` client component holds the UI inside `PageLayout`.

**Components** — `function` declarations, default export. AbortController in every async
`useEffect`. Card sizing via the `size` prop, padding via `bodyClassName`. Navigation uses `Link`
semantics, actions use `Button` semantics.

**Premium pages** — prefer `gen-*` classes (`gen-card-spotlight`, `gen-contact-sheet`,
`gen-divider-accent`, `gen-vignette`, `gen-grain`) over a generic `Card`.

**Animation** — `useGsapEntrance({ animations })` with `gsapPresets.fadeUp` /
`gsapPresets.staggerCards`.
