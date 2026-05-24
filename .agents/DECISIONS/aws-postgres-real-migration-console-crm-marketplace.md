# AWS/Postgres Real Migration Decisions

## Scope

Perform the real Mongo-to-Postgres migration across `../marketplace.genfeed.ai`, `../crm`, and `../console`, using `genfeed.ai` as the reference implementation.

## Key Decision

Do not treat all three repos as equivalent migration units.

- `marketplace` is a bounded Nest API with a small model graph.
- `crm` is a bounded Next.js app with a modest local data model.
- `console` is much larger and still deeply coupled to Mongoose across modules, DTOs, tests, and query logic.

## Execution Order

1. `marketplace` full Prisma/Postgres cutover
2. `crm` full Prisma/Postgres cutover
3. `console` staged cutover, collection by collection

## Why

- This sequence ships complete working migrations where the blast radius is manageable.
- It avoids mixing two bounded migrations with one repo-wide platform rewrite.
- It gives us concrete Prisma patterns to copy into `console` instead of inventing abstractions first.

## Shared Rules

- Keep `DATABASE_URL` as the only supported long-term database env.
- During transition, leave a clearly named legacy bridge only where runtime parity still demands it.
- Reuse `@genfeedai/prisma` / Prisma module patterns where they fit; create repo-local Prisma schemas where the domain is independent.

## Rejected Option

### Big-bang cutover of all three repos at once

Rejected because `console` is too large for a single safe diff and would block shipping the two bounded repos.
