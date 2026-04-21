# AWS/Postgres Prep Spec

## Purpose

Align the sibling `console`, `crm`, and `marketplace` repos with the Genfeed AWS Postgres direction before the full Mongo-to-Postgres migrations land.

## Non-Goals

- Replacing Mongoose models with Prisma in this pass
- Migrating data between databases
- Removing all Mongo scripts or historical maintenance tooling

## Interfaces

- Canonical database env: `DATABASE_URL`
- Temporary bridge env: `LEGACY_MONGODB_URI`
- Backward-compatible fallback env: `MONGODB_URI`

## Key Decisions

- Keep current Mongo runtime alive only as a bridge.
- Make docs/examples describe AWS Postgres as the target architecture.
- Update runtime/config helpers so legacy Mongo wiring is explicit instead of implicit.

## Edge Cases and Failure Modes

- Existing local environments may still only define `MONGODB_URI`; code must keep working through fallback.
- Some repos do not have centralized config validation; prep must not introduce false confidence about the migration being done.
- `console` currently imports a removed shared config export; that must be fixed as part of this pass.

## Acceptance Criteria

- `console`, `crm`, and `marketplace` all document `DATABASE_URL` as the primary DB target.
- Runtime/script code that still needs Mongo reads `LEGACY_MONGODB_URI` first, then falls back to `MONGODB_URI`.
- Primary docs no longer present MongoDB Atlas as the intended long-term architecture.
- Targeted tests or focused checks pass for the touched boundaries.

## Test Plan

- `console`: focused Vitest for config and preflight env handling
- `crm`: focused Vitest for the legacy Mongo resolver helper
- `marketplace`: focused Vitest for config env resolution
- All repos: focused Biome checks on touched files
