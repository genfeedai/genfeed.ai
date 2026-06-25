# ADR: Deployment Modes & Auth — SaaS / Community / Desktop

## Status

Accepted

## Spec Version

v1.1.0

## Last Updated

2026-06-22

## Canonical Source

This file. Contributor summary: [`docs/deployment-modes.md`](../../../docs/deployment-modes.md) (public: https://docs.genfeed.ai/deployment-modes). Implementation tracking: **epic #740** (deployment modes) + **epic #735** (Better Auth).

## Context

Genfeed ships from one monorepo to **three deployment targets**, but the codebase had no canonical definition of them. Mode was detected by 3–4 overlapping mechanisms that could disagree (`GenfeedMode` enum, `IS_SELF_HOSTED`/`IS_CLOUD`, a duplicate frontend `edition.ts`, `NEXT_PUBLIC_DESKTOP_SHELL`), and auth/switcher/billing behaviour was wired inconsistently as a result — e.g. the brand switcher silently disappeared in self-hosted while a useless org switcher was always shown.

**Validated against peers** (Cal.com, PostHog, Supabase, Nango, Dub, Twenty, Documenso, Medusa): gating org-level multi-tenancy behind EE is market-standard (Cal.com, PostHog); BYOK-free with zero call-home is the Supabase model; community-self-host-as-funnel (not a revenue tier) is PostHog's hard-won lesson; and peers support self-hostable auth for community deployments.

This ADR locks the product model, the boundaries, and the auth direction so every mode-conditional decision has one place to refer to.

## Decision

### 1. Three product modes = two axes

"Mode" is **two independent axes**, not one enum:

- **deployment**: `cloud` (SaaS) | `self-hosted` (Community)
- **client**: `web` | `desktop`

The three product modes are named combinations:

| Mode | deployment × client | Detection |
|---|---|---|
| **SaaS** | cloud × web | `GENFEED_CLOUD=1` |
| **Community** | self-hosted × web | no `GENFEED_CLOUD` |
| **Desktop** | (cloud **or** self-hosted) × desktop | `NEXT_PUBLIC_DESKTOP_SHELL=1` |

Desktop is a **client surface** that connects to either backend — never its own backend. The current `CLOUD`/`HYBRID`/`LOCAL` + `DESKTOP_SHELL` tangle collapses onto these two axes (#742).

### 2. Org / Brand structure (and the switcher rule)

The **brand** is the unit of content context (a brand owns one or more social accounts; you select a brand to create content). The **org** is the multi-tenancy boundary and only matters in SaaS.

| | SaaS | Community | Desktop |
|---|---|---|---|
| Orgs | **multiple** (isolated tenants) | **one** | one (local) |
| Brands | multiple per org | **multiple** | multiple (local) |
| **Org switcher** | **shown** | **hidden** | hidden |
| **Brand switcher** | **shown** | **shown** | **shown** |

**Switcher rule (canonical):** the **brand switcher is always shown and populated** in every mode; the **org switcher only renders in SaaS**. This corrects the prior bug where self-hosted hid the brand switcher and showed an org switcher that couldn't switch anything (#743).

### 3. Auth — own it with Better Auth

**One self-hostable auth system across all three modes: [Better Auth](https://better-auth.com)** (MIT, free). It runs **in-process** against our existing Postgres — no separate instance, no SaaS vendor, no call-home.

Better Auth ships **magic link, Google/GitHub OAuth, organizations/teams, and admin impersonation** as first-party plugins, with a Prisma/Postgres adapter and NestJS + Electron integrations.

| Mode | Auth |
|---|---|
| **SaaS** | Better Auth (email/password, magic link, Google) + multi-tenant orgs |
| **Community** | Better Auth, fully self-hostable + offline; **single org**. None required for solo/local; a login wall is just enabling it. |
| **Desktop** | local-first; the optional "connect" signs in via Better Auth → desktop↔cloud sync + cloud features + credits |

**Headless / API-first:** first-party `gf_*` API keys with a self-service management UI **and** CLI (#747) make the whole product drivable via the API + MCP with zero web-UI dependency.

Client features gate on **mode**, never on raw auth signals.

**Migration** is a phased rollout epic (#735). Better Auth organizations are implemented as an auth/session bridge while Genfeed `Organization`, `Member`, and `Role` remain the domain authorization and tenant-guard source. Use clean platform `role:superadmin` for SaaS control-plane access. Subscription state lives in DB-owned billing state.

### 4. Tenancy

**Multi-tenant org isolation is a SaaS / EE feature** (`ee/packages/multi-tenancy`, commercial). Community and Desktop are **single-tenant** (one org per instance). Multi-tenancy is the SaaS differentiator and is not given away in OSS.

> `ee/packages/multi-tenancy` is currently a scaffold (no enforcement code yet — #87). Until built, "multi-tenant" is the SaaS-only intent and Community's single-org model is the only path wired end-to-end.

### 5. Billing & generation

| Path | Availability | Bills |
|---|---|---|
| **BYOK** (your OpenAI/Replicate/fal/Ollama keys) | all modes | **free** — OSS infinite-credit stub, zero call-home |
| **Genfeed-managed inference** (`provider=genfeedai`, Fleet/LoRA) | cloud-connected only | credits, **purchased cloud-side** |

**Managed credits are cloud-only.** Community/Desktop buy credits on `api.genfeed.ai` (→ a `gf_` key scoped `managed-inference:execute`) and call the **cloud** `/v1/managed-inference`. A self-hosted backend cannot sell credits locally (`ManagedStripeCheckoutService` returns `503` when `IS_SELF_HOSTED`). This is the "API-only credits" funnel.

### 6. Build / ship / distribution

| Mode | Build | Ship |
|---|---|---|
| SaaS | `docker/Dockerfile.server` (includes `ee/`) | ECS/Fargate + Vercel |
| Community | `docker/Dockerfile.selfhosted` (excludes `ee/`) | GHCR `:latest`; `docker compose -f docker-compose.selfhosted.yml up` |
| Desktop | Electron (`desktop-v*` tags) | DMG/ZIP installers |

### 7. Canonical mode source of truth

**One** mode authority in `packages/config`, modeled as the two axes (§1), consumed by backend **and** frontend. Delete the duplicate frontend `edition.ts`, collapse the redundant `IS_SELF_HOSTED`/`IS_CLOUD` helpers, and standardize the `NEXT_PUBLIC_GENFEED_CLOUD` comparison to one truthiness helper (today `=== 'true'` vs truthy split-brains 6 sites). Tracked in #742.

### 8. Community charter

Community is a **funnel and credibility driver, not a revenue tier** (PostHog killed their paid self-hosted tier as a support black hole). Scope it explicitly: **Docker-Compose-only, single-tenant, community support, no SLA**, near-zero-maintenance for the Genfeed team, BYOK-free and fully offline-capable. The moment Community demands SaaS feature-parity it stops being a funnel and becomes a competing product to maintain.

### 9. Desktop

**Local-first**: offline BYOK generation + PGlite local cache, no account needed. The optional **"connect"** (Better Auth sign-in) unlocks desktop↔cloud sync + managed features + credits. **No bundled backend** — a thin local-first client, not a fourth product. (Community-in-a-box — bundling the single-container self-hosted stack for a fully-offline full-featured app — is feasible later since Community is one image, but is **deferred**.)

## Consequences (implementation — tracked on epics #735 and #740)

1. **Mode consolidation** → one canonical source, two axes (#742).
2. **Auth** → Better Auth across all modes; phased rollout (#735), Better Auth organizations bridge (#792), platform `role:superadmin` (#806), and headless API-keys UI + CLI (#747).
3. **Switcher rule** → brand always shown+populated; org SaaS-only (#743).
4. **CI** → fast PRs; heavy gates at release-cut; self-hosted E2E nightly-only; community build split from SaaS deploy (#744).
5. **Community "just works"** → fix docs/ports/compose + healthcheck (#745).
6. **Release-stage QA** → consolidated gate + post-deploy smoke (#746).
7. **EE extraction (#87)** → credits/subscriptions/Stripe/multi-tenancy → `ee/packages/*`; multi-tenancy stays the SaaS line.

## Related

- [ADR: PLG Boundary Between OSS and Genfeed Cloud](ADR-PLG-BOUNDARY-OSS-CLOUD.md)
- **Epic #735** — Better Auth (self-hostable auth, all modes)
- **Epic #740** — Deployment modes (canonical split, switcher, CI, community, QA)
- Supersedes the **auth half** of the closed One-API epic #95
- Issue #87 — EE billing / multi-tenancy extraction
