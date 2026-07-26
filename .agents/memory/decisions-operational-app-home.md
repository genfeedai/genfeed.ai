---
name: operational_app_home_decisions
description: Authenticated-root ownership and verified-connection evidence decisions for issue #1866.
type: project
---

# Operational App Home Decisions

## Optimization Target

Minimize frontend surface area while making `/` a reliable supervision entry
point with strict configured-state evidence, canonical scoped links, and
independent degradation.

## Considered Approaches

1. Render the state machine directly at the existing authenticated root.
   This meets the literal root contract, adds no route, and keeps onboarding
   behavior intact. It relies on protected bootstrap context rather than an org
   slug in the root URL.
2. Add `/:orgSlug/~/home` and redirect `/` there. This is explicitly
   organization-scoped but widens the protected route inventory and leaves the
   root as another redirect.
3. Repurpose `/:orgSlug` as the operational home. This reuses a scoped URL but
   changes an existing brand-selection landing and creates avoidable regression
   risk.

Approach 1 is selected.

## Configured-State Evidence

Successful Connect Genfeed verification already persists
`metadata.connectGenfeed.lastVerifiedAt` and `transport` on the selected API key.
The home uses that persisted proof plus active/revocation/expiry and canonical MCP
scope checks. Key naming, description, creation, or scope presence without
verification is not proof of connection.

## Data Composition

The operational home composes four existing frontend contracts:

- review inbox for approvals;
- active/recent runs and post analytics for publishing state;
- selected-brand credentials and account health for credential health;
- organization-scoped activities for recent activity.

No new backend aggregate is introduced. Independent queries keep one degraded
domain from blanking the entire home.

## Planning Record

The structured implementation plan was produced by the configured planner
(`fable`, high effort) on 2026-07-26 with verdict `PLAN_READY`. Opus remains the
required exact-head verifier after PR CI.

**Why:** Issue #1866 must remain frontend-owned and cannot infer connection from
an unverified key or expose unscoped operational data.

**How to apply:** Keep configured-state checks fail-closed, derive every link
from authorized protected context, and stop rather than adding a backend
contract inside this issue.
