---
name: dev orphan watchdog
description: Dev wrappers must reap children when Portless dies; prune on boot; never kill the shared :443 proxy
type: feedback
---

**Rule:** `run-portless` and `run-service` spawn children in their own process group, kill that group on SIGINT/SIGTERM, and exit if they become PID-1 orphans. Outer Portless boot runs `portless prune`. Diagnose hot `next-server` processes with `bun run dev:status` before blaming Genfeed. Never kill the shared Portless proxy on :443.

**Why:** A crashed Portless parent leaves `next-server` spinning at ~100% CPU. That showed up as Next 16.3.0 from another checkout (`vitaeai`, `:3001`) while Genfeed 16.3.1 was idle. Stale Portless routes also make `https://app.genfeed.localhost/` look crashed.

**How to apply:**

1. Keep the orphan watchdog and process-group kill in the wrappers.
2. Before assuming Genfeed is the CPU hog, run `bun run dev:status` and check each `next-server` cwd. `FOREIGN` means another repo.
3. Never `kill` the Portless proxy on :443 — other projects share it.
4. Interactive app URL stays `https://app.genfeed.localhost/`.
