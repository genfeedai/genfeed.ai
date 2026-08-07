---
name: enum_source_of_truth
description: Canonical status enums live as Prisma SCREAMING_SNAKE; domain packages mirror those values; ban as never for enum writes
type: project
last_verified: 2026-08-07
---

# Enum + assertion source of truth

## Why

Two parallel spellings for the same status (`pending` in `@genfeedai/enums` vs
`PENDING` in Postgres/`@genfeedai/prisma`) forced `status: BatchStatus.X as never`
writes. TypeScript was silent; Prisma rejected at runtime
(`Invalid value for argument status. Expected BatchStatus`). That class of bug
is not acceptable.

## Canonical rule

1. **Persisted as a Prisma enum** → domain enum values in `@genfeedai/enums`
   **must equal** the Prisma/Postgres labels **exactly** (SCREAMING_SNAKE).
   Prefer one shared name set (`PENDING`, `PROCESSING`, …). Rename domain
   aliases (`GENERATING` → `PROCESSING`) rather than mapping forever.
2. **Persisted as `String`** → pick one casing for that column and stick to it;
   prefer promoting hot paths to a Prisma enum over inventing a second string
   vocabulary.
3. **UI filter keys** (`ready`, `all`, query params) are not DB statuses — they
   may stay lowercase product language; they must not be reused as enum values.
4. **Never** write `status: SomeEnum.X as never` (or `as any`) into Prisma.
   Use a typed helper only when the domain type and Prisma type are
   structurally identical and the helper is an exhaustive map — temporary
   until packages share a single type export.
5. **Never** compare persisted status with a raw string literal
   (`status === 'pending'`). Use `SomeEnum.MEMBER`.

## Wire format

API JSON for Prisma-backed statuses is SCREAMING_SNAKE. Clients and CLI types
must match. No silent dual-accept in new code; legacy lowercase reads may exist
only behind an explicit `fromPrisma*` deserializer with a sunset path.

## Assertions ratchet

Production `as any` / `as never` / bare `@ts-ignore` are floored by:

```bash
bun run check:type-assertions
bun run check:type-assertions --update-baseline  # only when counts go down
```

New casts fail CI. Cleanups must prune the baseline in the same PR.

## How to add a status value

1. Add to `packages/prisma/prisma/schema.prisma` enum + migration.
2. Mirror the same label in `@genfeedai/enums` (or re-export if dependency
   direction allows later).
3. Update serializers, clients, and tests to the new member — no `as never`.

## Status (2026-08-07)

Harmonized to SCREAMING_SNAKE matching Prisma:

- `BatchStatus` / `BatchItemStatus` (pilot)
- `AgentRunStatus`, `IngredientStatus`, `WorkflowExecutionStatus`
- `TrainingStage`, `SubscriptionStatus`, `ByokBillingStatus` (#2504)

Still intentional exceptions:

- **`WorkflowStatus`** — domain stays product lowercase; `workflows.status` is a
  `String` column (orphan Prisma type drop tracked separately).
- **`CampaignTargetStatus`** — domain keeps a richer outreach pipeline vocabulary
  (orphan Prisma type; no column yet).
- **`Platform` / `CredentialPlatform`** — still product-lowercase OAuth/UI
  language; BaseService + write mappers upper-case for the Prisma column.
- Domain-only extras (e.g. `AgentRunStatus.BUDGET_EXHAUSTED`, Stripe-only
  subscription states) stay SCREAMING and must be mapped before a Prisma write.

Residual dual-case candidates: `ArticleStatus` (`PUBLIC`→`PUBLISHED` rename),
`IngredientCategory` and other category enums, `AgentAutonomyMode`,
`PersonaStatus`, `ContentDraftStatus`, `BotStatus`, `LeadStatus`, etc.
