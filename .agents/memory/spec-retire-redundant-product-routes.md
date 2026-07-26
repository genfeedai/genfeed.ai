---
name: retire_redundant_product_routes_spec
description: Executable route inventory, product classification, and evidence gates for issue #1867.
type: project
---

# Retire Redundant Product Routes Spec

## Purpose

Make protected and public product-route ownership executable before removing any
surface. The inventory must fail closed when a Next.js page, trusted protected
registration, catch-all expansion, hard cut, or public classification drifts.

## Non-Goals

- Remove or redirect any route in the foundation slice.
- Treat Studio or Remix as automatically removable.
- Contract Research, Trends, Ads, Library, approvals, posts/calendar,
  integrations, workflows, analytics, API keys, billing, settings, or audit.
- Change authorization, tenant scope, deployment-mode behavior, or server APIs.

## Interfaces

- `WorkspaceShellRouteRegistration.productClass` classifies every trusted
  protected route as `control-plane`, `visual-data`, `contextual-action`,
  `compatibility-only`, or `removable`.
- `PUBLIC_ROUTE_CLASSIFICATION_REGISTRY` classifies every non-protected app page
  and every website page without coupling either application runtime to the
  other.
- `check:route-inventory` discovers `page.tsx` and `page.ts` files, normalizes
  Next route groups and dynamic/catch-all segments, and compares discovered
  routes to the checked-in registries in both directions.
- Organization catch-all expansions and the two hard-cut families remain
  explicit data in the guard.

## Key Decisions

- Protected classifications live on the existing trusted runtime registration
  rather than in a duplicate map.
- Public classifications live in the CI-only guard because they are review
  metadata, not website or authenticated-app runtime state.
- The foundation slice contains no `removable` registrations. Retirement
  requires evidence from a later slice.

## Edge Cases And Failure Modes

- Next route groups do not contribute URL segments.
- `[parameter]`, `[...parameter]`, and `[[...parameter]]` normalize
  deterministically.
- The organization catch-all page must exist and its 22 canonical expansions
  must stay registered.
- `/:orgSlug/~/workspace/*` and
  `/:orgSlug/~/settings/organization/*` remain intentional hard cuts and may not
  silently return to the trusted registry.
- Duplicate, missing, stale, or invalid classifications fail the guard.
- Route retirement is blocked when replacement, authorization, direct-link,
  deployment-mode, or usage evidence is absent.

## Acceptance Criteria

- THE SYSTEM SHALL classify every trusted protected route with exactly one
  protected product class.
- THE SYSTEM SHALL classify every public app and website page with exactly one
  public product class.
- WHEN a protected or public page is added, removed, or renamed without a
  matching registry change THE SYSTEM SHALL fail `check:route-inventory`.
- WHEN a protected registration or public classification has no backing page or
  declared catch-all expansion THE SYSTEM SHALL fail `check:route-inventory`.
- THE SYSTEM SHALL preserve every protected control-plane and visual-data route
  across cloud web, self-hosted web, and Desktop.
- WHILE usage telemetry is absent THE SYSTEM SHALL NOT classify Studio, Remix,
  or another route as removable.

## Test Plan

- Fixture tests cover route normalization, duplicate detection, invalid
  classifications, missing entries, and stale entries.
- A repository-level fixture asserts the exact current page and registration
  counts.
- Workspace-shell registry tests assert protected family classifications and
  an empty `removable` set.
- Focused app, architecture, type-check, formatting, and CI checks provide the
  foundation-slice evidence.
