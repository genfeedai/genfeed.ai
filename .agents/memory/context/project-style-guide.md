---
created: 2026-04-07T00:00:00Z
last_updated: 2026-06-29T00:00:00Z
version: 1.1
author: Claude Code PM System
---

# Style Guide — Genfeed.ai

## TypeScript

- **No `any` types** — define proper interfaces
- **No inline interfaces** — place in `packages/props/` (component) or `packages/interfaces/` (state/helpers)
- **No `console.log`** — use project LoggerService
- **Booleans**: `is`/`has` prefix (`isActive`, `hasPermission`)
- **Path aliases** over relative imports (`@genfeedai/enums`, `@components/`, `@ui/`)

## Import Order

1. External packages (react, next, nestjs)
2. Internal packages (`@genfeedai/*`)
3. Path aliases (`@components/*`, `@ui/*`)
4. Relative (same directory only)

## Git Conventions

- **Conventional commits**: `fix:`, `feat:`, `refactor:`, `chore:`, `test:`, `build:`
- **Branch flow**: trunk-based — short-lived branches off `master` → PR → `master`
- **Feature branches**: `feat/xxx` off `master`
- **Never commit secrets**

## Formatting

- **Biome 2.4.x** for formatting and import organization
- Run `npx biome check --write .` before commits
- Sorted keys enabled in Biome config

## Frontend

- Components use `function` declarations, default export
- Card styling via `size` prop, padding in `bodyClassName`
- Navigation = `Link` semantics, Actions = `Button` semantics
- AbortController in every useEffect with async calls
- `gen-*` CSS prefix for design system classes
- `--gen-accent-*` CSS variables for theming

## Backend

- NestJS exceptions for errors (`NotFoundException`, `BadRequestException`)
- `ConfigService` pattern — never `process.env` directly
- Soft deletes: `isDeleted: boolean`
- **Multi-tenant queries (enterprise only)**: `{ organizationId: orgId, isDeleted: false }` — this pattern lives in `ee/packages/multi-tenancy/`. Single-tenant deployments use `{ isDeleted: false }` only unless the domain model already carries an organization id.
- Compound indexes live in `packages/prisma/prisma/schema.prisma` via `@@index` or in explicit migrations.

## Naming

- Agent tool names: `snake_case`
- CSS classes: `gen-*` prefix
- CSS variables: `--gen-accent-*`
- Package names: `@genfeedai/{name}`

## Testing

- Colocated test files: `*.test.ts` / `*.spec.ts`
- TDD: write failing tests first, then implement
- Run per-package: `bun run test --filter=@genfeedai/[name]`
- Never run full test suite locally
