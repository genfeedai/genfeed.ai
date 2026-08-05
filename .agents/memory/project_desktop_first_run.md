---
name: Desktop boots the canonical app with Genfeed Connect sign-in
description: The Electron shell serves apps/app and signs in through system-browser PKCE plus a Better Auth session cookie on the shell origin
type: project
status: active
last_verified: 2026-08-05
topics: [desktop, auth, shell, sync, privacy]
---

**Rule:** Genfeed Desktop is the canonical app in an Electron shell. The shell
builds and serves `apps/app` as a standalone Next.js bundle on
`http://127.0.0.1:3230`, and sign-in is **Genfeed Connect**: system-browser PKCE
that returns both a main-process `gf_` API key and a Better Auth session cookie
installed on the shell origin. SaaS = Desktop.

**Why:** A second, desktop-local renderer meant every product surface had to be
built twice, and it drifted immediately. One app, one auth model, one set of
routes. Browser-session credential forms still must not be embedded in
Electron — hence the system browser, not an in-window login.

**How to apply:**

- Point Desktop build/dev/copy scripts at `apps/app` (`scripts/dev.cjs`,
  `build-app-shell.cjs`, `copy-app-shell.cjs`). There is no desktop-local Next
  app, `pages/`, or `src/renderer/` tree.
- Bake the embedded bundle's env at **build** time: `API_URL` = the real API
  origin (the `/v1` rewrite target), `NEXT_PUBLIC_API_ENDPOINT` =
  `http://127.0.0.1:<appPort>/v1` (the local shell origin, never the cloud one),
  `NEXT_PUBLIC_API_URL=/v1`, plus the real `NEXT_PUBLIC_WS_ENDPOINT` and
  `NEXT_PUBLIC_CDN_URL`. `NEXT_PUBLIC_*` and `rewrites()` are inlined at build
  time; runtime env cannot correct them.
- Keep API traffic same-origin through the shell's `/v1` rewrite so the
  shell-origin session cookie is actually sent.
- The **Better Auth session cookie is the routing authority** for pages and the
  proxy. The `gf_` API key is a main-process credential injected as
  `x-genfeed-desktop-token`; it never reaches the page and never, on its own,
  authorizes a route.
- Install the session cookie host-only on the shell origin with an explicit
  `expirationDate`, re-apply it on launch, and clear it atomically with the
  `gf_` key on sign-out.
- Gate every login mode on desktop — `/login`, `/login/password`,
  `/login/magic-link`, and the onboarding gate — to the desktop sign-in surface.
  Navigate only after the session is confirmed, not merely on the login event.
- "Work offline" is a disabled demand signal until a real local path ships.
  Local PGlite, BYOK generation, and sync remain main-process Phase-2 backends.
- Keep the local user/device IDs stable when a cloud account is connected.
- Persist sync consent per cloud user; a different cloud account requires a new
  decision. Carry the initiating cloud user ID through sync mutation IPC and
  reject stale writes after the active account changes.
- Sync threads and metadata only after consent is granted.
- Upload full asset bytes only when consent allows it and the asset has
  `uploadPolicy=full`; never upload `uploadPolicy=never` assets.
- Do not queue generic cloud actions with copy promising they will complete
  after sign-in unless a real processor and end-to-end coverage exist.
