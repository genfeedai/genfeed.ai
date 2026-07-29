---
name: Local Development Host Spec
description: Acceptance contract for the clean HTTPS Portless local-development environment
type: project
status: active
last_verified: 2026-07-29
topics: [development, environment, configuration, notifications]
---

# Local Development Host Spec

## Purpose

Make worktree-aware Portless HTTPS routes the only default interactive local-development contract and ensure every runtime receives matching domains and endpoints through an environment or configuration boundary.

## Non-goals

- Removing fixed-port `dev:direct` commands used for explicit debugging.
- Changing deployed infrastructure or Docker/self-hosted service ports.
- Removing temporary `local.genfeed.ai` compatibility from security allowlists.
- Replacing production endpoint defaults.

## Interfaces

- `scripts/dev/run-portless.ts`, `scripts/dev/portless-env.ts`, and the direct-runtime environment adapter.
- Root `dev*`, `dev:portless:*`, and explicit `dev:direct:*` commands.
- Root `.env.local` and generated app/service env files as canonical service-origin configuration.
- Next.js `NEXT_PUBLIC_*` values.
- Browser extension `PLASMO_PUBLIC_*` values.
- NestJS config services.
- `WorkflowUIConfig` injection for execution/SSE endpoints.
- Playwright environment helpers for mocked local endpoints.

## Acceptance criteria

- THE SYSTEM SHALL use clean HTTPS Portless routes on port `443` for every normal interactive-development command.
- THE SYSTEM SHALL enable Portless TLS and disable hosts-file synchronization in the repository runner.
- THE SYSTEM SHALL expose `https://<service>.genfeed.localhost` without an explicit port for every routed interactive service.
- THE SYSTEM SHALL preserve Portless worktree prefixes when deriving sibling service origins.
- THE SYSTEM SHALL keep browser API and Better Auth traffic on the app origin under `/v1` and proxy it server-side to the derived API origin.
- THE SYSTEM SHALL derive API, app, website, files, MCP, notifications, websocket, trusted-origin, and configured OAuth redirect values from the current process's `PORTLESS_URL`.
- THE SYSTEM SHALL keep committed local-development endpoint defaults on clean HTTPS service origins.
- THE SYSTEM SHALL inject fixed-port endpoints only through explicit `dev:direct:*` commands and keep Docker/E2E port configuration at those boundaries.
- WHEN direct local notifications/websocket development is requested, THE SYSTEM SHALL use port `3111`.
- THE SYSTEM SHALL preserve port `3011` for Docker, self-hosted, deployed infrastructure, health checks, and boundary-neutral tests where applicable.
- THE SYSTEM SHALL resolve browser endpoints through public build-time variables or injected configuration without importing server-only environment access.
- WHEN the browser extension runs in development, THE SYSTEM SHALL inspect the canonical app host for auth cookies and recognize canonical auth URLs.
- WHEN a legacy `local.genfeed.ai` origin is presented to an explicit compatibility allowlist, THE SYSTEM SHALL continue to accept it during the migration window.
- WHEN Playwright mocks local API traffic, THE SYSTEM SHALL derive route matching from the configured local API endpoint.
- THE REPOSITORY SHALL contain zero unexplained active `local.genfeed.ai` defaults.

## Test plan

- Test main-checkout, worktree-prefixed, clean HTTPS, custom-TLD, trusted-origin, redirect, and malformed Portless URL derivation.
- Guard package scripts, route mappings, default commands, and Turbo concurrency as an architecture invariant.
- Guard the HTTPS/443/no-hosts-sync proxy contract and canonical environment-example origins.
- Test CORS acceptance for canonical HTTPS Portless routes and worktree prefixes.
- Retain explicit compatibility assertions for Better Auth, CORS, Next development origins, terminal origins, extension host permissions, and local-only guards.
- Use repository lint/format/static searches locally; use pull-request CI for tests, typechecks, and builds.
