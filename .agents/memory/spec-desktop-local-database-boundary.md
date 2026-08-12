---
name: desktop_local_database_boundary_spec
description: Cloud-first desktop startup contract with explicit lazy activation and a versioned first local-database baseline.
type: project
---

# Desktop Local Database Boundary Spec

## Purpose

The desktop app must open the Genfeed web shell without constructing, migrating,
or querying PGlite. The embedded PostgreSQL-compatible database belongs only to
the explicitly selected local/offline mode. A local-database failure must never
prevent a cloud/web user from opening the desktop window.

## Non-Goals

- Install or manage PostgreSQL, Redis, Homebrew packages, daemons, or the NestJS
  backend on the user's machine.
- Remove PGlite from the desktop bundle; it remains available for local mode.
- Run PGlite opportunistically after the window becomes visible.
- Change the hosted web application's authentication or deployment contract.
- Bundle model weights or claim pure offline media generation for providers that
  still require an external service.

## Interfaces

- The desktop shell starts in `cloud` mode unless a small, PGlite-independent
  desktop preference records an explicit `local` selection.
- Cloud authentication persistence uses Electron `safeStorage` and a
  PGlite-independent file-backed store. The Electron cookie jar remains the
  canonical web-session transport.
- `app.enableOfflineMode()` is the only public transition that may persist
  `local` mode and start the local runtime.
- The desktop sign-in surface exposes a real local-mode action. Selecting it
  shows initialization progress, enters the canonical app shell when ready, and
  exposes retry or return-to-cloud recovery when initialization fails.
- Desktop settings expose the current data mode and an explicit cloud/local
  switch. Switching away from a supported local database preserves it and never
  occurs implicitly.
- Local-runtime IPC handlers share one idempotent lazy initializer. Before local
  mode is selected, they return a structured `LOCAL_MODE_NOT_ENABLED` result
  rather than constructing PGlite implicitly.
- The local runtime owns PGlite, desktop migrations, Prisma, local identity,
  workspaces, sync state, files, local generation configuration, and other
  database-backed desktop services.

## Key Decisions

- Window creation and web-shell availability are independent of PGlite.
- The selected runtime mode and cloud session cannot be stored inside the
  database whose startup they control.
- Local initialization happens once, on demand, and concurrent requests await
  the same promise.
- A failed local initialization leaves the shell open and cloud mode usable.
- Local mode is usable without a Genfeed Cloud session. Cloud-only actions keep
  their existing sign-in boundary while local workspaces and BYOK/local provider
  settings use the Electron bridge.
- The current schema is the first supported desktop database baseline. An
  unversioned pre-release database is discarded only after the user explicitly
  selects local mode; it is not migrated or queried by Prisma-backed services.
- Default web-shell startup does not create or touch `pglite-db`.

## Edge Cases And Failure Modes

- A user with an existing PGlite directory but no explicit local-mode preference
  starts in cloud mode; the directory remains untouched.
- A user who explicitly selected local mode starts the local runtime on the next
  launch. If it fails, the app shows a local-mode recovery state while retaining
  access to the web shell.
- If cloud-session storage cannot be decrypted, the invalid record is discarded
  safely and the user signs in again; PGlite is not started as a fallback.
- Multiple local IPC calls during activation share the same initialization and
  cannot run migrations concurrently.
- The local initializer accepts the versioned supported baseline and recreates
  an unversioned pre-release database instead of maintaining compatibility code.
- Switching back to cloud mode stops future local initialization; it does not
  delete the local database.
- A local-mode user without a workspace receives the existing local workspace
  creation/selection path rather than a cloud onboarding loop.

## Acceptance Criteria

- WHEN Genfeed Desktop starts in cloud mode THE SYSTEM SHALL create and display
  the web shell without constructing PGlite, running desktop migrations,
  constructing Prisma, or touching the `pglite-db` directory.
- WHEN a cloud user signs in THE SYSTEM SHALL persist the desktop session without
  reading or writing PGlite and SHALL continue to protect it with Electron
  `safeStorage` when available.
- WHEN the user explicitly selects local mode THE SYSTEM SHALL persist that mode
  outside PGlite and SHALL initialize the complete local runtime exactly once.
- WHEN local initialization succeeds THE SYSTEM SHALL enter the canonical
  `apps/app` shell without requiring a Cloud session or a separately running
  NestJS API.
- WHEN the user switches to cloud mode THE SYSTEM SHALL preserve local data,
  avoid initializing PGlite on the next cloud launch, and present the Genfeed
  Connect sign-in/session path.
- WHILE local mode has not been selected THE SYSTEM SHALL NOT initialize PGlite
  in response to incidental bootstrap, shell, session, or local-feature reads.
- IF local-runtime initialization fails THE SYSTEM SHALL keep the web shell
  available and SHALL report the local feature failure without showing the
  generic application-startup failure screen.
- GIVEN an unversioned pre-release database WHEN the user explicitly starts
  local mode THE SYSTEM SHALL discard it before creating the first supported
  baseline and SHALL NOT maintain a row-preserving compatibility path.
- THE SYSTEM SHALL NOT install or start a system PostgreSQL server, Redis, a
  backend daemon, or a Homebrew dependency.

## Test Plan

- A cloud-start unit/integration test proves that PGlite construction and local
  migration functions are not called and no local database path is requested.
- Session-store tests cover encrypted round-trip, unavailable `safeStorage`,
  malformed records, and sign-out without importing a database service.
- Lazy-runtime tests cover explicit activation, one-time initialization,
  concurrent callers, persisted mode, and failure isolation.
- IPC contract tests prove local handlers return `LOCAL_MODE_NOT_ENABLED` before
  activation and do not activate the runtime as a side effect.
- App-shell component tests cover selecting local mode, progress, success,
  failure/retry, returning to cloud mode, and accessible control semantics.
- Database tests start from both a fresh schema and an unversioned pre-release
  database and verify the supported baseline marker and explicit reset behavior.
- Packaged-desktop smoke coverage verifies cloud startup without a PGlite
  directory and local startup against the supported database baseline.
- PR CI supplies test, type-check, and build evidence; this MacBook does not run
  those workloads locally.
