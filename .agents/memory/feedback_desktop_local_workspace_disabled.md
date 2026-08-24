---
name: desktop_local_workspace_disabled
description: Desktop local/PGlite workspace stays a disabled coming-soon until explicitly re-enabled
type: feedback
status: active
last_verified: 2026-08-24
topics: [desktop, local-workspace, pglite]
---

**Rule:** Genfeed Desktop ships cloud sign-in only. Keep the local workspace entry visible as a coming-soon demand signal, and keep it disabled. Login, `/desktop/local`, File → Open Workspace, persisted local mode, and `appEnableOfflineMode` must not start PGlite until `DESKTOP_LOCAL_WORKSPACE_ENABLED` is flipped on purpose.

**Why:** Local mode was wired as a live action, so clicking **Use a local workspace** opened the on-device PGlite screen. Cloud is the supported desktop path; the offline epic is still open.

**How to apply:** The gate lives in `@genfeedai/desktop-contracts` as `DESKTOP_LOCAL_WORKSPACE_ENABLED`. Leave it `false`. Do not re-enable the login button, folder picker, or Electron boot restore without an explicit product ask to ship local workspace.
