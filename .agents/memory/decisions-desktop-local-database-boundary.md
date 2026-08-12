---
name: desktop_local_database_boundary_decisions
description: Alternatives and scope decisions for isolating the desktop web shell from PGlite startup.
type: project
---

# Desktop Local Database Boundary Decisions

## Current Decision

Use an explicit runtime boundary. Cloud/web mode creates the desktop window and
auth session without PGlite. Local mode is persisted outside PGlite and is the
only path that initializes the embedded database and its dependent services.

## Considered Approaches

1. **Explicit cloud/local runtime boundary (recommended).** Move cloud-session
   persistence to a small `safeStorage`-protected file store, persist the mode in
   a database-independent preference, and place every local service behind one
   lazy initializer. This exactly matches the product contract and isolates
   local failures, at the cost of a deliberate service-lifecycle refactor.
2. **Create the window first, then initialize PGlite in the background.** This is
   a smaller patch and avoids a blank window, but it still spends memory, disk,
   and CPU for cloud-only users and can surface irrelevant database errors. It
   violates the requested boundary.
3. **Ship local mode as a separate app or helper process.** This gives the
   strongest process isolation, but duplicates packaging, signing, update, and
   IPC surfaces. The current requirement does not justify that release and
   maintenance cost.

Approach 1 is selected.

## Local Backend Shape

Local mode reuses the already packaged Electron-main workspace, files, drafts,
generation, terminal, sync, Prisma, and PGlite services through the typed preload
bridge. The canonical `apps/app` frontend owns the local route. It does not ship
a second renderer and it does not bundle or spawn a second NestJS/Redis stack.

This supersedes the embedded-full-API assumption in the older deferred #2378
decomposition for this user path. That approach would increase an already large
desktop bundle and duplicate runtime infrastructure even though the typed local
service boundary already exists. Cloud remains the full hosted product; local
mode exposes the capabilities that have concrete local adapters and labels
network-using BYOK providers honestly.

## Local-Mode Product Scope

The user explicitly selected the full end-to-end scope on 2026-08-12. Replace
the disabled “Work offline — coming soon” demand signal with a real local-mode
action, initialization and recovery states, a route into the canonical app
shell, and an explicit data-mode switch. This PR owns the startup boundary and
the usable selection journey together; it must not land as a backend-only hook.

The scope does not expand into bundling model weights or inventing unsupported
offline media adapters. Existing local/BYOK capabilities remain honest about
whether their configured provider uses the network.

## Legacy Data Decision

The migration ledger cannot be treated as proof that an older table has the
current shape because the initial migration used `CREATE TABLE IF NOT EXISTS`.
Add a forward-only, idempotent repair migration for the known missing
`desktop_workspace.linked_brand_id` and `desktop_workspace.sync_policy` columns.
Do not delete, recreate, or silently reset an existing local database.

## Failure Boundary

Application startup owns only Electron/window/web-shell failures. Local-runtime
startup owns PGlite, migration, Prisma, and local-service failures. A local
failure is recoverable within the open shell and cannot be promoted to the
application-wide startup screen.

**Why:** A desktop wrapper for the hosted app has no need for an embedded
database unless the user deliberately chooses local data. The current eager
dependency makes unrelated legacy-schema drift fatal to every desktop user.

**How to apply:** Keep every cloud startup dependency database-free. New local
features must enter through the shared explicit local-runtime boundary and must
not add eager PGlite access to bootstrap or session code.
