---
name: agency cost reporting decisions
description: Architecture and tradeoffs for organization and brand cost reporting
type: project
status: active
last_verified: 2026-08-26
topics: [billing, costs, agencies, brands, api, csv]
---

# Agency Cost Reporting Decisions

## Approaches Considered

1. **New unified `GenerationCostEvent` table.** Querying would be simple, but
   LLM and media ledgers would either become duplicate sources of truth or need a
   risky replacement migration. Credits also do not map one-to-one to provider
   calls, so a single-row abstraction would imply false precision.
2. **Extend existing ledgers and add a normalized reporting projection
   (chosen).** `LlmVendorCost` and `MediaVendorCost` remain authoritative for
   platform cost. Direct nullable brand attribution makes invoices stable while
   the reporting service can union cost rows with credit transactions honestly.
3. **Resolve brand only at query time.** This avoids a migration but makes past
   reports change when source records change or disappear, and unresolved joins
   silently lose customer spend.

## Why the Projection Keeps Credits Separate

A customer-facing credit transaction can cover a turn, batch, workflow node, or
retry while the provider ledger records individual LLM completions and finalized
media outputs. Forcing them into one row would invent a relationship that does
not always exist. The API therefore exposes one normalized timeline with an
explicit entry type: vendor-cost entries carry micro-USD and credit entries carry
credits. Summaries aggregate both measures independently.

## Brand Attribution

- New LLM rows take `brandId` from the dispatcher call context.
- New media rows take `brandId` from the immutable generated ingredient scope.
- Historical media rows backfill through `ingredientId`.
- Historical LLM rows backfill through `runId` first and `threadId` second.
- Missing attribution stays nullable and is labeled `Unattributed`.
- Media completion writes are idempotent per organization + ingredient because
  synchronous return and provider webhook paths can observe the same output.
- Every brand filter is checked against `(brand.id, organizationId,
  isDeleted=false)` before a report query runs.

## Route and UI Placement

`Settings -> Usage` already owns the organization credit ledger, so it evolves
into **Cost & Usage** rather than adding a competing billing page. Brand Settings
gets the same `/settings/usage` suffix and reuses the report component with the
brand locked from route context.

## API and CSV

Dedicated `/costs` endpoints keep vendor COGS distinct from `/credits`. JSON and
CSV share one normalized query and field vocabulary so external billing systems
do not need separate integrations. CSV is capped and formula-safe using the same
security stance as Analytics export.

## Rejected

- Configurable markup and invoicing: agency pricing policy belongs outside this
  cost-observation slice.
- Deriving provider USD from credits: credits include product margin and are not
  COGS.
- Dropping unattributed rows: organization totals must remain complete even when
  historical brand lineage is unavailable.
- Prompt or completion text in exports: unnecessary for billing and a privacy
  boundary violation.
