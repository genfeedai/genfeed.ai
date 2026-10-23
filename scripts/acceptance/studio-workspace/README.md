# Studio Workspace split acceptance

This opt-in harness exercises the real Playground using local synthetic API,
wallet, draft, model, preview and Socket.IO responses. It captures the idle,
pending and completed states at **375 × 1000** and **1440 × 1000**, dark mode,
English, UTC, reduced motion and device scale 1. It never invokes a provider.

The runner uses installed Brave with an isolated browser context and one worker.
It does not start servers, load environment files, reuse real authentication or
run the shared global setup/teardown. Browser service workers are blocked.
A final page-level request guard blocks every external origin, with synthetic
image responses for fixture CDN assets. Unhandled API requests cannot leave the
local app. Point the frontend's server-side API URL at unreachable loopback and
start no backend. The WebSocket fixture never connects to a broker.

## Prepare

Use an isolated checkout from the exact source revision being measured. Install
locked dependencies and build package prerequisites through their own scripts;
for example `bun run --cwd packages/contracts build`. Never add fake entrypoints
or edit generated outputs when an export is unresolved.

Start a credential-free frontend under its own Portless name using the canonical
HTTPS proxy on 443. Set these child-process variables from its `PORTLESS_URL`:

- `NEXT_PUBLIC_API_ENDPOINT=$PORTLESS_URL/v1`
- `NEXT_PUBLIC_APPS_APP_ENDPOINT=$PORTLESS_URL`
- `NEXT_PUBLIC_WS_ENDPOINT` to that origin with `wss:`
- `API_URL=http://127.0.0.1:9`
- `PLAYWRIGHT_TEST=true`, `NEXT_PUBLIC_PLAYWRIGHT_TEST=true`
- `NEXT_PUBLIC_PLAYWRIGHT_BANNER_SKIP=true`
- Empty analytics, error-reporting and provider keys; no copied `.env` files

The runner needs the repository's existing local Portless proxy. If it is down,
record that blocker; do not substitute a production URL or a shared server.
The provided config uses the installed macOS Brave executable.

## Capture before and after

Run from the repository root, replacing the example URL with the worktree's
unique Portless URL. `NEXT_PUBLIC_API_ENDPOINT` must match the frontend's endpoint
so all inherited fixture routes are intercepted. Use a new absolute output
directory for each run; captures refuse to overwrite existing files.

```sh
APP_BASE_URL=https://workspace-acceptance.genfeed.localhost \
NEXT_PUBLIC_API_ENDPOINT=https://workspace-acceptance.genfeed.localhost/v1 \
STUDIO_SPLIT_EVIDENCE_DIR=/absolute/artifacts/workspace-before \
bunx --no-install playwright test \
  --config scripts/acceptance/studio-workspace/playwright.config.ts
```

Capture the same source twice before editing to establish repeatability. Then
capture the candidate split with identical fixture, browser, settings and
viewports into `workspace-after`. Compare:

```sh
node scripts/acceptance/studio-workspace/compare.mjs \
  /absolute/artifacts/workspace-before /absolute/artifacts/workspace-after
```

The comparator fails for different PNG hashes, missing states, mismatched browser
or viewport settings, blocked traffic, anything other than one intercepted
image-generation request, and missing or worse render counters. A missing or
failed capture does not establish visual parity. Keep the PNGs beside their
receipts and inspect them; hashes are a strict equality gate, not a visual review.

## Render measure

The pre-hydration React DevTools hook counts **committed renders** whose fibers
carry `PerformedWork`. It observes the stable named boundaries
`StudioPlaygroundWorkspace`, `StudioPlaygroundComposer` and
`StudioPlaygroundResults`, from clicking Generate through the completed preview.
It excludes discarded StrictMode invocations and does not count newly extracted
children as a regression merely because the tree has more components. It is not
a wall-time benchmark or a provider/queue latency measurement.

Each receipt records exact source HEAD, browser version, viewport, fixture
version, PNG SHA-256 values and named render counts. No receipt is written if
counter installation failed or any named boundary was not observed. This setup
covers one image generation flow; draft restoration, reference handling,
Inspector actions, video generation and other responsive/theme states still need
their existing specs and any task-specific acceptance checks.

## Verify tooling

```sh
node --test scripts/acceptance/studio-workspace/compare.test.mjs
bunx --no-install playwright test \
  --config scripts/acceptance/studio-workspace/playwright.config.ts --list
```

Ordinary test runs skip capture unless `STUDIO_SPLIT_EVIDENCE_DIR` is set. This is
an explicit evidence setup, with no baseline update mode or production behavior.
