# AWS/Postgres Real Migration Spec

## Purpose

Replace live Mongo/Mongoose runtime usage with Prisma/Postgres in the sibling `marketplace`, `crm`, and `console` repos.

## Non-Goals

- One-shot migration of every `console` collection in a single diff
- Historical data backfill scripting in this pass unless required for runtime boot
- Cross-repo schema unification beyond what is necessary to run each app on Postgres

## Interfaces

- Runtime database env: `DATABASE_URL`
- Legacy Mongo bridge env only where a repo has not fully cut over yet
- Prisma schemas and generated clients in the owning repo or shared package

## Repo Targets

### Marketplace

- Replace Nest Mongoose modules/services with Prisma-backed services
- Remove runtime dependency on `@nestjs/mongoose` and `mongoose`
- Keep API surface stable

### CRM

- Replace Mongoose models/services with Prisma-backed DB access
- Keep Next.js route handler contracts stable
- Remove runtime dependency on Mongoose once services are converted

### Console

- Add real Prisma module/runtime and migrate the first coherent slice
- Keep the repo bootable while Mongoose remains for the unmigrated collections

## Acceptance Criteria

- `marketplace` runs on Prisma/Postgres and no longer requires Mongo for runtime boot
- `crm` runs on Prisma/Postgres and no longer requires Mongo for runtime boot
- `console` has real Prisma runtime integrated and at least one full collection slice migrated cleanly
- Focused tests or type/lint checks pass for the changed boundaries in each repo

## Risks

- `console` contains Mongo-specific query patterns and ObjectId assumptions that require staged replacement
- `marketplace` and `crm` may need repo-local Prisma schemas because their domains are not covered by `genfeed.ai`’s schema
- Existing repo-level lint/type issues must be separated from migration regressions
