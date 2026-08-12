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
- Cloud smoke confirms the canonical shell renders without creating a PGlite
  directory. Local mode explicitly initializes workspace/files/drafts, sync,
  terminal, and BYOK generation services.
- Packaged artifacts include `GenFeed-*.dmg`, `GenFeed-*.zip`, and
  `genfeed-desktop-release.json`.

## Release Evidence

- Link the passing `Desktop QA` workflow run for the candidate branch or PR.
- Link the `Desktop Release` workflow run for the signed macOS artifact.
- Attach or reference the generated `genfeed-desktop-release.json` manifest.
- When authenticated screenshot evidence is required, provide the optional
  `GENFEED_DESKTOP_VISUAL_QA_SESSION` release-only fixture to the trusted job.
  It contains a disposable `gf_` key plus signed cookie, is consumed only by
  Electron main, and must never be uploaded as evidence or used as a customer
  or production runtime credential. When it is absent, the workflow records the
  deferral while keeping Desktop QA, smoke, signing, notarization, and
  Gatekeeper verification as hard release gates.
- When captured, attach the `genfeed-desktop-visual-qa` artifact containing
  `desktop-login.png`, `pkce-callback.png`, `authenticated-route.png`,
  `logout.png`, `restart-persistence.png`, and
  `expired-credential-recovery.png`, captured from the packaged `.app`.
- Record macOS runner version, release tag or commit SHA, signing/notarization
  result, and any deferred manual checklist item.
