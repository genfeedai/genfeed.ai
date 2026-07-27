---
name: operational_app_home_decisions
description: Authenticated-root ownership and verified-connection evidence decisions for issue #1866.
type: project
---

# Operational App Home Decisions

## Current Decision

Completed users do not remain on `/`. The proxy resolves canonical organization
and brand scope and redirects to
`/:orgSlug/:brandSlug/workspace/overview`. If the current scope is
organization-only, root/default entry routing selects an available brand and
refreshes the signed workspace-scope cookie. The canonical Workspace overview
uses the operational home as its default composition while preserving a saved
custom dashboard when one exists.

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

The original approach 1 was superseded during live QA on 2026-07-27. The proxy
now returns the resolved Workspace redirect. Better Auth onboarding redirects,
stale Desktop-token handling, and canonicalization of other bare protected
paths remain unchanged. Authenticated Desktop and keyless self-hosted roots
follow the same Workspace landing contract.

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

The original implementation intentionally made the operational home reachable
at `/`. Live QA superseded that route ownership: the canonical Workspace
overview is the completed-user landing and owns the operational content as its
default composition. The root keeps the same content only as a
resolution-failure fallback.

**Why:** Issue #1866 must remain frontend-owned and cannot infer connection from
an unverified key or expose unscoped operational data.

**How to apply:** Keep configured-state checks fail-closed, derive every link
from authorized protected context, and stop rather than adding a backend
contract inside this issue.
