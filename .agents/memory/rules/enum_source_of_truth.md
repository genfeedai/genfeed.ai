---
name: enum_source_of_truth
description: Canonical status enums live as Prisma SCREAMING_SNAKE; domain packages mirror those values; ban as never for enum writes; Platform/CredentialPlatform uses mandatory mapper
type: project
last_verified: 2026-08-20
---

# Enum + assertion source of truth

## Why

Two parallel spellings for the same status (`pending` in `@genfeedai/contracts` vs
`PENDING` in Postgres/`@genfeedai/prisma`) forced `status: BatchStatus.X as never`
writes. TypeScript was silent; Prisma rejected at runtime
(`Invalid value for argument status. Expected BatchStatus`). That class of bug
is not acceptable.

## Canonical rule

1. **Persisted as a Prisma enum** → domain enum values in `@genfeedai/contracts`
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
6. **`ReviewDecision` is the explicit #2644 exception:** Postgres retains the
   uppercase `ReviewDecision` labels, while every product/API/JSON boundary uses
   lowercase `ReviewDecision` plus explicit `unset`. Prisma writes use
   `PersistedReviewDecision`; reads cross `parseReviewDecision`. Do not add
   another spelling or bypass those mappers.

## Wire format

API JSON for Prisma-backed statuses is SCREAMING_SNAKE except review decisions,
whose #2644 product contract is lowercase. Clients and CLI types must match the
product contract. No silent dual-accept in new code; compatibility reads may
exist only behind an explicit mapper with a documented persistence boundary.

## Assertions floor

Production `as any` and `@ts-ignore` are banned (zero). `@ts-expect-error`
remains allowed for intentional, documented type errors. Production
`as never` is a shrinking ratchet:

```bash
bun run check:type-assertions
bun run check:type-assertions --update-baseline  # as never only, when counts go down
```

New `as any` / `@ts-ignore` fail CI. `as never` cleanups must prune the
baseline in the same PR. There is no `--update-baseline` escape hatch for
banned kinds.

## How to add a status value

1. Add to `packages/prisma/prisma/schema.prisma` enum + migration.
2. Mirror the same label in `@genfeedai/contracts` (or re-export if dependency
   direction allows later).
3. Update serializers, clients, and tests to the new member — no `as never`.

## Done vs residual matrix (2026-08-07)

| Area | Storage | Domain casing | Agent rule |
| --- | --- | --- | --- |
| **Status Prisma enums** (BatchStatus, IngredientStatus, WorkflowExecutionStatus, ArticleStatus, BotStatus, BrandInterviewStatus, PersonaStatus, …) | Prisma enum | SCREAMING_SNAKE = Prisma labels | Use enum members. Never `as never`. Guard: `prisma-parity.enum.test.ts`. TrainingStage / SubscriptionStatus / ByokBillingStatus land via #2506. `AgentRunStatus` was dropped with the AgentRun model. |
| **`PostStatus`, `TaskStatus`, and similar product statuses** | **String** column | **lowercase product language** | Keep as-is. Do **not** re-harmonize into SCREAMING or invent dual maps. |
| **`WorkflowStatus`** | **String** column | product lowercase | Keep as-is. Orphan Prisma enum dropped in #2492 — do not reintroduce. |
| **`ReviewDecision`** | Postgres enum with retained uppercase labels | product lowercase (`unset` / `approved` / `rejected` / `request_changes`) | Mandatory `PersistedReviewDecision` / `parseReviewDecision` boundary from #2644. JSON and API never expose uppercase labels. |
| **`ContentDraftStatus`, `CampaignTargetStatus`** | **String** column (`content_drafts.status`, `campaign_targets.status`) | SCREAMING domain vocabulary | Domain-only. Orphan Prisma enums dropped in `20260807160000_drop_orphan_enums` — do not reintroduce. Not in the parity ratchet. Casing is canonical: `20260808120000_canonicalize_draft_target_status_casing` (#2543) uppercased the legacy rows and set defaults to `'DRAFT'` / `'PENDING'`. Guard: `packages/prisma/prisma/status-casing-migration.test.ts`. |
| **`ReferenceImageCategory`, `AgentAutonomyMode`** | no column | SCREAMING domain vocabulary | Domain-only. Orphan Prisma enums dropped in `20260807160000_drop_orphan_enums` — never had a column. Not in the parity ratchet. |
| **`AgentQualityTier`, `AgentGoalProfile`, `OutreachCampaignStatus`** | no column, no domain enum | n/a | Fully removed in `20260807160000_drop_orphan_enums`. Nothing in the repo referenced them. |
| **`Platform` (domain)** | posts / UI / OAuth free text | **lowercase** (`instagram`, `devto`) | Product language. Posts store lowercase `String`. |
| **`credentials.platform`** | Prisma **`CredentialPlatform`** enum | **SCREAMING** (`INSTAGRAM`, `DEVTO`) | **Mandatory mapper** — see below. |
| Domain-only extras (Stripe-only subscription states) | n/a | SCREAMING | Map before any Prisma write. |

### Platform / CredentialPlatform — mandatory mapper

Domain `Platform` and the re-export `CredentialPlatform` stay **lowercase** for
OAuth, UI, and `posts.platform` (String). The Prisma column
`credentials.platform` is **SCREAMING** (`enum CredentialPlatform`, with the
intentional exception **`DEVTO`** not `DEV_TO`).

**Always** use the shared helpers when reading or writing credentials by platform:

```ts
import {
  toPrismaCredentialPlatform,
  fromPrismaCredentialPlatform,
} from '@genfeedai/contracts';

// credential find / create / update
platform: toPrismaCredentialPlatform(platform) // → 'INSTAGRAM' | undefined

// credential row → post / UI domain id
platform: fromPrismaCredentialPlatform(credential.platform) // → Platform.INSTAGRAM
```

**Do not:**

- Write `platform: 'instagram'` (or domain `CredentialPlatform.INSTAGRAM`) into
  `prisma.credential.findFirst` / `create` / `update` filters or data.
- Hand-roll `.toUpperCase()` / local switch maps for credential platforms.
- Use `as never` / `as any` for enum or platform Prisma writes.
- “Re-harmonize” String columns (`posts.platform`, `PostStatus`, `TaskStatus`,
  `WorkflowStatus`) into SCREAMING to match credentials — that is the wrong fix.

Implementation: `packages/contracts/src/enums/platform-prisma.mapper.ts`.
Tests: `packages/contracts/__tests__/enums/platform-prisma.mapper.test.ts`.

## Status (2026-08-07)

All shared-name domain enums that back a Prisma **column** are SCREAMING_SNAKE
and include every Prisma label as a value. Guard: `packages/contracts/__tests__/enums/prisma-parity.enum.test.ts`.

**No Prisma enum has lowercase labels.** `BrandInterviewStatus` was the last one
(`in_progress` / `completed` / `abandoned`); it was renamed to SCREAMING via
`ALTER TYPE ... RENAME VALUE` and given a matching domain enum in
`@genfeedai/contracts`. Nothing in the schema may reintroduce lowercase Prisma
labels — the parity ratchet fails on them.

Still intentional exceptions (see matrix above):

- **`WorkflowStatus`** — domain stays product lowercase; `workflows.status` is a
  `String` column (orphan Prisma type dropped in #2492).
- **`CampaignTargetStatus`** — domain keeps a richer outreach pipeline vocabulary
  than the dead Postgres type ever had; `campaign_targets.status` is a `String`
  column (orphan Prisma type dropped in `20260807160000_drop_orphan_enums`).
- **`ContentDraftStatus`** — domain-only SCREAMING vocabulary;
  `content_drafts.status` is a `String` column (orphan Prisma type dropped in
  `20260807160000_drop_orphan_enums`).
- **`ReferenceImageCategory` / `AgentAutonomyMode`** — domain-only; the
  same-named Postgres types never had a column and were dropped in `20260807160000_drop_orphan_enums`.
- **`Platform` / credential `CredentialPlatform`** — intentional split +
  **mandatory** `toPrismaCredentialPlatform` / `fromPrismaCredentialPlatform`.
- **`ReviewDecision`** — intentional persistence split from #2644 + mandatory
  `PersistedReviewDecision` / `parseReviewDecision`; the product/API/JSON
  vocabulary is lowercase and includes explicit `unset`.
- Domain-only extras (Stripe-only subscription states) stay SCREAMING and must
  be mapped before a Prisma write.
