---
name: Local Development Host Spec
description: Acceptance contract for the genfeed.localhost environment and runtime migration
type: project
status: active
last_verified: 2026-07-14
topics: [development, environment, configuration, notifications]
---

# Local Development Host Spec

## Purpose

Make `genfeed.localhost` the canonical interactive local-development host and ensure every runtime receives domains and endpoints through an environment or configuration boundary.

## Non-goals

- Changing deployed infrastructure or Docker/self-hosted service ports.
- Removing temporary `local.genfeed.ai` compatibility from security allowlists.
- Replacing production endpoint defaults.

## Interfaces

- Root `.env.local` contract and generated app/service env files.
- Next.js `NEXT_PUBLIC_*` values.
- Browser extension `PLASMO_PUBLIC_*` values.
- NestJS config services.
- `WorkflowUIConfig` injection for execution/SSE endpoints.
- Playwright environment helpers for mocked local endpoints.

## Acceptance criteria

- THE SYSTEM SHALL use `genfeed.localhost` for every active interactive-development default.
- THE SYSTEM SHALL use port `3111` for local notifications and websocket development endpoints.
- THE SYSTEM SHALL preserve port `3011` for Docker, self-hosted, deployed infrastructure, health checks, and boundary-neutral tests where applicable.
- THE SYSTEM SHALL resolve browser endpoints through public build-time variables or injected configuration without importing server-only environment access.
- WHEN the browser extension runs in development, THE SYSTEM SHALL inspect the canonical app host for auth cookies and recognize canonical auth URLs.
- WHEN a legacy `local.genfeed.ai` origin is presented to an explicit compatibility allowlist, THE SYSTEM SHALL continue to accept it during the migration window.
- WHEN Playwright mocks local API traffic, THE SYSTEM SHALL derive route matching from the configured local API endpoint.
- THE REPOSITORY SHALL contain zero unexplained active `local.genfeed.ai` defaults.

## Test plan

- Extend config/unit tests for canonical app detection, URL normalization, injected workflow execution endpoints, browser-extension auth domains, and local-only guards.
- Retain explicit compatibility assertions for Better Auth, CORS, Next development origins, terminal origins, extension host permissions, and local-only guards.
- Use repository lint/format/static searches locally; use pull-request CI for tests, typechecks, and builds.

