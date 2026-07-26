---
name: retire_redundant_product_routes_decisions
description: Route inventory architecture and retirement evidence decisions for issue #1867.
type: project
---

# Retire Redundant Product Routes Decisions

## Optimization Target

Minimize duplicate route ownership while making route contraction reviewable,
bidirectional, mode-safe, and impossible to land without explicit evidence.

## Considered Approaches

1. Add the protected product class to each trusted shell registration and keep
   public classifications in a CI-only registry. This reuses the protected
   source of truth, keeps public metadata out of runtime bundles, and lets one
   filesystem guard detect drift in both directions.
2. Create one new standalone map containing all protected and public routes.
   This is visually centralized but duplicates all 211 protected canonical URLs
   and can disagree with the runtime registry.
3. Generate and commit a route manifest from page files. This reduces manual
   enumeration but cannot infer product ownership, hard-cut intent, or
   catch-all expansion semantics; generated churn also weakens review.

Approach 1 is selected.

## Classification Decisions

- Research, Ads, Trends, and analytics boards are `visual-data`.
- Library, approvals, publishing/calendar, workflows, settings, billing, API
  keys, activity/audit, workspace, and administration are `control-plane`.
- Studio, compose/editor, agent creation, post composer, and Remix are
  `contextual-action`.
- Organization `write` aliases and brand workflow aliases are
  `compatibility-only`.
- No route is `removable` in the foundation slice.

## Retirement Gate

A later slice may retire a route only when all five inputs are current and
specific to that route family:

1. exact canonical replacement;
2. authorization and scope parity;
3. direct-link, reload, and Back/Forward behavior;
4. cloud-web, self-hosted-web, and Desktop behavior;
5. authoritative usage evidence.

The connected `app.genfeed.ai` PostHog project returned zero pageviews for the
90 days ending 2026-07-27 and exposed no pageview properties. That is missing
telemetry, not proof of zero use, so it blocks route deletion.

## Planning Record

The configured Fable-high planner and required Opus-high planning fallback both
returned HTTP 429 weekly-limit failures on 2026-07-27. The implementation
provider recorded `planning_degraded` and produced this bounded fallback plan.
Exact-head Opus review remains a separate delivery gate and is not waived.

**Why:** #1867 requires executable ownership before subtraction, and the current
analytics project cannot support a safe usage-based deletion decision.

**How to apply:** Keep classifications adjacent to their real owner, fail CI on
drift in either direction, and leave retirement candidates preserved until
every gate has evidence.
