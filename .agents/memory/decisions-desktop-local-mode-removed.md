---
name: Desktop local mode was removed
description: Why Genfeed Desktop dropped its local workspace (PGlite database, BYOK generation, local sync) and stays a cloud API client
type: project
status: active
last_verified: 2026-11-26
topics: [desktop, scope, architecture]
---

**Decision (Vincent, 2026-11-26, #11460):** Genfeed Desktop has no local mode. It
talks to Genfeed Cloud or a self-hosted server through the API, like the web app.
What Desktop adds is access to this machine's CLIs and tools: the terminal and
Claude Code / Codex agent turns. Epic #2378 and its children were closed as not
planned.

**Why:**

- The local workspace (an embedded PGlite database, local BYOK generation,
  drafts, workspace files and a sync queue) was a second backend inside the
  Electron main process. It had been switched off behind a platform flag for
  months and no user ran it, yet every Desktop release still had to package,
  test and migrate it.
- Desktop scope is "cloud API only, no local generation" (2026-11-26). Keeping
  dead local code around would invite work that conflicts with that scope.
- Removing it shrank the Electron main bundle and the packaged app, and dropped
  the PGlite native payload and its pinned upgrade path.

**How to apply:**

- Do not reintroduce a local database, local generation or a local/cloud mode
  switch in Desktop. New Desktop capability is a native action over IPC (session,
  server picker, terminal, agent CLIs) on top of the cloud API.
- An install of `desktop-v0.1.2` may still hold its old `pglite-db` and
  `.genfeed` workspace files on disk. Desktop no longer reads or deletes them.
- The runtime context has no `runtimeMode` or `localProvider`; credits and
  generation depend only on `status` and `generationExecution`.
