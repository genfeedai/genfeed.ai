---
created: 2026-04-07T00:00:00Z
last_updated: 2026-04-07T00:00:00Z
version: 1.0
author: Claude Code PM System
---

# System Patterns — Genfeed.ai

## Architecture Patterns

### Multi-Tenancy (Enterprise Only)

Multi-tenant organization isolation is an enterprise feature in `ee/packages/multi-tenancy/`. When enabled, MongoDB queries include `{ organization: orgId, isDeleted: false }` and the global `CombinedAuthGuard` (APP_GUARD) enforces org-scoped access. Use `@Public()` to opt out of auth.

Single-tenant (default self-hosted) deployments do NOT require `organization` in queries — only `{ isDeleted: false }`.

### Serializer Pipeline
DB Document -> Serializer -> Client Response. Never return raw Mongoose documents.
- File triplet: `{name}.attributes.ts` + `{name}.config.ts` + `{name}.serializer.ts`
- Attributes use `createEntityAttributes()` (auto-adds timestamps + isDeleted)
- Configs use `simpleConfig()` or spread `STANDARD_ENTITY_RELS` / `CONTENT_ENTITY_RELS`
- Server serializers use `buildSerializer('server', config)`

### Service Module Factory
Backend modules use `createServiceModule()` factory (auto-includes ConfigModule + LoggerModule). Circular deps use `forwardRef(() => Module)`.

### Soft Deletes
`isDeleted: boolean` field — never `deletedAt`. All queries filter `isDeleted: false`.

### Queue Processing
BullMQ queues with Redis. All cron jobs live in the workers service.

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
- Credentials scoped: `{ platform: CredentialPlatform.X, isDeleted: false }` (add `organization: orgId` only with enterprise multi-tenancy)

### Agent Tools
- Registration chain: tool def -> credit cost -> agent type config -> executor handler -> UI label -> test
- Names: snake_case
- Read-only tools in `SHARED_READ_TOOLS`; specialized in specific `AgentType` configs

## Data Patterns

### Credits System (Enterprise)
Credits-based billing lives in `ee/packages/billing/`. Single balance pool per org. Transactions tracked with `source` field.

### Indexes
Compound indexes in module `useFactory`, simple indexes via `@Prop` decorator.
