# @genfeedai/ee-analytics — Phase C Extraction Plan

Tracking issues: [#87](https://github.com/genfeedai/genfeed.ai/issues/87), [#160 Analytics Backbone](https://github.com/genfeedai/genfeed.ai/issues/160)

Plan file: `.claude-genfeedai/plans/delegated-churning-sifakis.md` §5.1b

## Status

**Layer 1 — scaffold only.** No package.json yet. This is a README-only placeholder that reserves the target directory for Phase C Layer 2 work.

**Layer 2 — TODO:**

**Critical prep: disambiguate the two `BusinessAnalytics` surfaces first.** Per the Codex adversarial review of the audit plan, there are two distinct surfaces:

1. `apps/server/api/src/collections/business-analytics/business-analytics.module.ts:26` — module imported by `app.module.ts:23`
2. `apps/server/api/src/endpoints/analytics/business-analytics.service.ts:92` — separate non-module service

Before moving code, inventory both and decide OSS vs. EE ownership for each. Likely outcome:
- The collection module (`collections/business-analytics/`) moves here (it's advanced cohort/revenue analytics, EE-only).
- The endpoints service (`endpoints/analytics/business-analytics.service.ts`) stays in OSS and reads from an EE-exposed interface when available.

## Move targets (pending inventory)

| Source | Target | Notes |
|---|---|---|
| `apps/server/api/src/collections/business-analytics/` | `src/business-analytics/` | Module, controller, service, schemas |
| `ee/packages/analytics/src/contracts.ts` | Define `IBusinessAnalyticsService` contract in `@genfeedai/interfaces/analytics` | Layer 1 prep for endpoint hand-off |

## OSS behavior when EE is disabled

The OSS `endpoints/analytics/business-analytics.service.ts` should fall back to a basic per-platform analytics aggregation using only `collections/content-performance/` data. No cohort analysis, no revenue attribution, no forecasting — those are EE features.

## Related

- Epic #160 (Analytics Backbone rollup) must land first so the analytics surface is documented before the split
- Epic #87 (EE extraction parent)
