---
name: desktop_local_workspace_disabled
description: Desktop local/PGlite workspace stays a disabled coming-soon until explicitly re-enabled
type: feedback
status: active
last_verified: 2026-08-24
topics: [desktop, local-workspace, pglite]
---

**Rule:** Desktop local/PGlite workspace is a PostHog-gated slice (`desktop_local_workspace`), not the full offline OS. SaaS fail-closes until PostHog returns true. Desktop/OSS shells without PostHog keep the working `/desktop/local` folder + BYOK surface. When the flag is off, keep a disabled demand-signal button on login — do not send people to an empty coming-soon page.

**Why:** Full offline Genfeed (embedded Nest API + Postgres) is still deferred on #2378. The PGlite/BYOK landing page already works. A hardcoded disable produced a void screen; PostHog is the rollout control.

**How to apply:** Gate login and `/desktop/local` with `useDesktopLocalWorkspaceFlag`. Flip the PostHog flag to ship or hide the slice without another deploy. Do not treat `/desktop/local` as the complete studio offline.
