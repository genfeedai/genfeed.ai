# Desktop Release QA

Use this checklist for desktop release candidates and PRs that can affect the
packaged Electron shell.

## Automated Gate

- GitHub Actions workflow: `Desktop QA`.
- Trigger: desktop release tags, manual dispatch, and trunk PR/release gates that
  call the reusable `Desktop QA` workflow.
- Command: `bunx turbo run qa:release --filter=@genfeedai/desktop`.
- Coverage: desktop lint, type-check, Bun tests, native rebuild, canonical
  `apps/app` standalone build, and Electron `--smoke-test` readiness. Smoke only
  passes after `did-finish-load`, the `gf-desktop-shell` body marker renders,
  and the sandboxed preload exposes the desktop bridge.

## Manual Checklist

- Fresh launch shows the Electron-owned boot screen before the app shell loads.
- The loaded product surface is the canonical `apps/app`; no desktop-local
  renderer or credential form is packaged.
- Browser sign-in uses system-browser PKCE and rejects invalid or replayed
  callbacks.
- Successful exchange installs the exact signed Better Auth cookie on the
  loopback shell origin as a host-only, HttpOnly cookie with its expiration.
- Browser requests use same-origin `/v1`; the `gf_` API key is absent from page
  state and only appears in main-process request-header injection.
- Restart restores a non-expired persisted cookie; an expired cookie/key pair
  recovers to the login surface.
- Sign-out removes the cookie and API key together before emitting signed-out
  state.
- Workspace selection, recent workspaces, drafts, and content-run handoff survive
  app restart.
- Local generation provider setup keeps the API key out of renderer-visible
  state and shows a recoverable error before a provider is configured.
- Genfeed Cloud generation is available after sign-in when the API is reachable.
- Dormant Phase-2 services (PGlite, sync, workspace/files/drafts, terminal,
  tray, updater, and BYOK generation) remain packaged without renderer-owned
  event dispatch.
- Packaged artifacts include `GenFeed-*.dmg`, `GenFeed-*.zip`, and
  `genfeed-desktop-release.json`.

## Release Evidence

- Link the passing `Desktop QA` workflow run for the candidate branch or PR.
- Link the `Desktop Release` workflow run for the signed macOS artifact.
- Attach or reference the generated `genfeed-desktop-release.json` manifest.
- Provide `GENFEED_DESKTOP_VISUAL_QA_SESSION` to the trusted release job as a
  JSON session fixture containing a valid `gf_` key plus signed cookie. It is
  consumed only by Electron main and must never be uploaded as evidence.
- Attach the `genfeed-desktop-visual-qa` artifact containing
  `desktop-login.png`, `pkce-callback.png`, `authenticated-route.png`,
  `logout.png`, `restart-persistence.png`, and
  `expired-credential-recovery.png`, captured from the packaged `.app`.
- Record macOS runner version, release tag or commit SHA, signing/notarization
  result, and any deferred manual checklist item.
