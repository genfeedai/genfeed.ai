# Desktop Release QA

Use this checklist for desktop release candidates and PRs that can affect the
packaged Electron shell.

## Automated Gate

- GitHub Actions workflow: `Desktop QA`.
- Trigger: pull requests to `develop`, `staging`, or `master` when desktop,
  embedded app shell, desktop package, root dependency, or workflow files change.
- Command: `bun run --filter=@genfeedai/desktop qa:release`.
- Coverage: desktop lint, type-check, Bun/Vitest tests, native rebuild, packaged
  app-shell build, and Electron `--smoke-test` boot.

## Manual Checklist

- Fresh launch shows the Electron-owned boot screen before the app shell loads.
- No-API launch enters local/offline mode without requiring a server clone.
- Browser sign-in deep link preserves a valid session and rejects invalid or
  replayed callbacks.
- Workspace selection, recent workspaces, drafts, and content-run handoff survive
  app restart.
- Local generation provider setup keeps the API key out of renderer-visible
  state and shows a recoverable error before a provider is configured.
- Genfeed Cloud generation and sync are available after sign-in when the API is
  reachable.
- Menu, tray, global shortcuts, terminal, library, trends, workflows, agents,
  and analytics surfaces render without blank states.
- Packaged artifacts include `GenFeed-*.dmg`, `GenFeed-*.zip`, and
  `genfeed-desktop-release.json`.

## Release Evidence

- Link the passing `Desktop QA` workflow run for the candidate branch or PR.
- Link the `Desktop Release` workflow run for the signed macOS artifact.
- Attach or reference the generated `genfeed-desktop-release.json` manifest.
- Record macOS runner version, release tag or commit SHA, signing/notarization
  result, and any deferred manual checklist item.
