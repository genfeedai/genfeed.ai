---
name: agency cost reporting
description: Organization and brand generation-cost reporting, CSV export, and authenticated API access
type: project
status: active
last_verified: 2026-08-26
topics: [billing, costs, agencies, brands, api, csv]
---

# Agency Cost Reporting Spec

## Purpose

Give agencies an auditable view of generation spend for their organization and
each customer brand. The report exposes immutable platform vendor cost in USD
micro-units separately from customer-facing credits, with JSON and CSV access
for external invoicing systems. Prompt and completion content never enter the
reporting surface.

## Non-Goals

- Agency markup configuration, invoice creation, payment collection, or tax.
- Replacing the existing credit wallet or changing generation prices.
- Assigning an organization-wide or unresolvable event to an arbitrary brand.
- Exposing cost data without authenticated organization scope.
- Adding a second vendor-cost source of truth.

## Interfaces

### Persistence

- `LlmVendorCost.brandId` is nullable and tenant-safe. Agent completions pass the
  active brand directly; the migration backfills from run/thread lineage where
  possible.
- `MediaVendorCost.brandId` is nullable and tenant-safe. Finalization records the
  immutable brand from the generated ingredient; the migration backfills by
  `ingredientId` where possible.
- Existing rows that cannot be resolved remain `brandId = null` and report as
  `Unattributed`.
- Both ledgers retain micro-USD integers and never store prompt/completion text.

### Authenticated API

- `GET /costs/summary?from=<ISO>&to=<ISO>&brandId=<id?>`
  returns organization totals, daily series, and per-brand totals for provider
  cost, generation count, BYOK count, and credits used.
- `GET /costs/entries?from=<ISO>&to=<ISO>&brandId=<id?>&limit=<n>&skip=<n>`
  returns a newest-first normalized ledger containing LLM vendor-cost, media
  vendor-cost, and credit-transaction entries.
- `GET /costs/export?from=<ISO>&to=<ISO>&brandId=<id?>` returns the same normalized
  ledger as formula-injection-safe UTF-8 CSV, capped at 10,000 rows.
- Missing dates default to the trailing 30 days. Date ranges may not exceed 366
  days. `brandId` must belong to the authenticated organization.
- API-key use follows the existing managed-cloud API entitlement boundary;
  session-authenticated Settings requests remain available to organization
  members.

### Settings

- Organization Settings uses `/settings/usage` as the canonical Cost & Usage
  page. It shows organization totals, per-brand split, date filtering, a brand
  filter, the normalized ledger, and CSV export.
- Brand Settings exposes `/settings/usage`, reusing the same component with the
  route brand locked as the filter.
- Provider cost and credits are labeled separately. BYOK vendor cost remains
  zero while BYOK event counts remain visible.

## Key Decisions

See `decisions-agency-cost-reporting.md`.

## Edge Cases and Failure Modes

- Brandless and unresolved historical events stay visible as `Unattributed`.
- A brand from another organization is rejected, never treated as an empty
  result.
- BYOK events count as generations but contribute zero platform vendor cost.
- Unknown/self-hosted model prices remain zero-cost events, matching the ledger
  contract.
- CSV cells beginning with `=`, `+`, `-`, or `@` are neutralized.
- Reporting failure never affects generation; generation-time cost writes remain
  best-effort.
- The synchronous media completion path records cost before returning success so
  local/self-hosted execution is no longer omitted.

## Acceptance Criteria

- WHEN a dispatcher-routed LLM completion has an active brand, THE SYSTEM SHALL
  persist that `brandId` with its vendor-cost row.
- WHEN a media generation is finalized, THE SYSTEM SHALL persist the generated
  ingredient's `brandId` with its vendor-cost row across webhook and synchronous
  completion paths.
- WHEN an organization member requests a cost summary, THE SYSTEM SHALL return
  provider cost and credits separately for the organization and each brand.
- WHEN a valid brand filter is supplied, THE SYSTEM SHALL return only entries
  attributed to that brand.
- IF an event cannot be attributed to a brand, THE SYSTEM SHALL retain it under
  an explicit `Unattributed` group.
- WHEN a caller supplies a brand owned by another organization, THE SYSTEM SHALL
  reject the request.
- WHEN CSV export is requested, THE SYSTEM SHALL export the current date/brand
  scope with safe spreadsheet cells and a 10,000-row limit.
- WHEN organization Settings is opened, THE SYSTEM SHALL show organization cost
  totals and a per-brand split.
- WHEN brand Settings Cost & Usage is opened, THE SYSTEM SHALL show the same
  report locked to the route brand.
- THE SYSTEM SHALL never return prompt or completion content from cost APIs or
  CSV exports.

## Test Plan

- Prisma ledger service specs for direct brand persistence and tenant filters.
- Cost-reporting service specs for org totals, brand filters, unattributed rows,
  BYOK zero-cost behavior, pagination, and credits kept separate.
- Controller specs for organization scope, cross-tenant brand rejection, date
  validation, response serialization, CSV headers, and formula-injection safety.
- Settings component tests for org totals, brand selection, brand-locked scope,
  and CSV download behavior.
- Structural migration coverage for nullable brand columns, tenant-safe indexes,
  foreign keys, and lineage backfills.
