---
name: Desktop account-less first run and sync consent
description: Desktop reuses the shared auth presentation, enters one workspace shell, and requires per-account sync consent
type: project
status: active
last_verified: 2026-07-18
topics: [desktop, auth, offline, sync, privacy]
---

**Rule:** Genfeed Desktop offers system-browser PKCE or an account-less local
entry from the shared auth presentation. Both paths render the same agent-first
workspace; cloud-only actions are capability-gated in place.

**Why:** Desktop-local work and BYOK generation must not require a Genfeed
account, while browser-session credential forms must not be embedded in
Electron. Local data must not begin syncing merely because PKCE completed.

**How to apply:**

- Keep the account-less choice persisted and skip the auth interstitial on
  later launches.
- Keep the local user/device IDs stable when a cloud account is connected.
- Persist sync consent per cloud user; a different cloud account requires a new
  decision.
- Sync threads and metadata only after consent is granted.
- Upload full asset bytes only when consent allows it and the asset has
  `uploadPolicy=full`; never upload `uploadPolicy=never` assets.
- Do not queue generic cloud actions with copy promising they will complete
  after sign-in unless a real processor and end-to-end coverage exist.
