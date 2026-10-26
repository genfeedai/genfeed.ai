---
name: verify-genfeed
description: Launch the real Genfeed app locally and prove a change works by driving it with the existing Playwright setup, capturing screenshot evidence, and cleaning up. Use when asked to verify, smoke-test, screenshot or "see it working" for a UI or API change in the running app, or when a Playwright lane fails and you need to know whether the stack, the env or the spec is at fault.
metadata:
  version: "1.0.0"
  tags: "verification, playwright, e2e, local-development, evidence"
  last_verified: "2026-10-26"
---

# Verify Genfeed in the running app

Unit and mocked specs do not prove the product works. This skill launches the real
stack, drives one feature through the Playwright setup under `playwright/`, saves a
screenshot, and cleans up without losing the evidence. Run it on the host your
repository policy allows for dev servers and tests.

Tier background lives in `docs/e2e-tiers.md`; the host contract lives in the
`local-development-host` skill. This skill only sequences them.

## 1. Launch

```bash
bun run dev:setup                                       # once per machine (Portless HTTPS on :443)
bunx turbo run build --filter=@genfeedai/serializers   # once per fresh checkout or worktree
bun run env:check                                       # must print "Env check passed."
bun run dev:backend:min                                 # api + files + notifications (background)
bun run dev:app                                         # app (background)
```

- Postgres and Redis must already be running (`pg_isready`, `redis-cli ping` → `PONG`).
- Use `bun run dev:backend` instead only when the feature needs mcp or workers.
- In a linked worktree, run `bun run wt:sync <path>` first or no env files exist.
- Routes are `https://<branch-prefix>.app.genfeed.localhost` in a linked worktree and
  `https://app.genfeed.localhost` in the main checkout. Read the real URL from
  `bun run dev:status`; never guess a port.

## 2. Doctor

Run before driving anything. Stop at the first failure and fix it; a spec driven on a
broken stack only produces noise.

1. `bun run dev:doctor` → "Portless is ready".
2. `bun run dev:status` → your `app`, `api`, `files`, `notifications` routes are
   listed. `FOREIGN` entries belong to another repo: leave them, and never kill the
   shared proxy on :443.
3. `bun run env:check` → pass. Failures name deprecated keys that a stale source
   `.env.local` carried into the worktree. Delete those key lines from the worktree
   copy only, never from the source file, and never print values.
4. Load the app once. `Module not found ... @genfeedai/serializers/request-runtime`
   means the serializers package was never built (the build step in Launch).
5. Backend log shows the API listener ready; app log shows `Ready`.

`references/failure-modes.md` maps symptoms to causes.

## 3. Drive

Use the existing Playwright config; do not write a parallel harness. Point it at the
live routes and skip its own web server:

```bash
export APP_BASE_URL=https://<your-app-route>
export E2E_API_ENDPOINT=https://<your-api-route>/v1
export NEXT_PUBLIC_API_ENDPOINT=$E2E_API_ENDPOINT
export PLAYWRIGHT_SKIP_WEBSERVER=1
export NODE_EXTRA_CA_CERTS=$HOME/.portless/ca.pem   # Node must trust the Portless CA
```

Pick the lane by what the change touches:

| Lane | Command | Auth | Use for |
|---|---|---|---|
| single spec | `bunx playwright test --config=playwright/configs/playwright.config.ts --project=app-core <spec>` | mocked | fastest proof of one feature |
| core | `bun run test:e2e:core` | mocked (3 layers) | UI behavior, the release gate |
| smoke | `bun run test:e2e:smoke` | mocked | every route renders |
| authed | `bun run test:e2e:authed:local` | real Better Auth session | real API, proxy and bootstrap path |

The authed lane signs up a throwaway user against the local API (`auth.setup.ts`) and
writes `playwright/artifacts/.better-auth/user.json`. It never touches production. Run
one spec at a time, for example:

```bash
bun run test:e2e:authed:local playwright/e2e/tests/smoke/all-app-pages.authed.spec.ts
```

Find the right spec in `references/features/<feature>.md`. Each file says what exists,
how a user reaches it, how to drive it, and what usually breaks.

## 4. Evidence

Playwright only keeps screenshots on failure. For a passing proof, capture one with the
helper, which reuses the real-auth session from step 3 (run the authed lane first):

```bash
bun run .agents/skills/verify-genfeed/scripts/capture.ts <route> <label>
```

`<route>` is the org-scoped path the app redirected `/` to during the authed run (read
it from the authed spec output or the page URL). The helper writes `<label>.png` and
`<label>.json` (final URL, title, HTTP status) under
`${GENFEED_VERIFY_EVIDENCE_DIR:-$HOME/genfeed-verify-evidence}/<UTC-stamp>/`, outside
the repo and the worktree. Attach the PNG and the passing Playwright summary to the PR
or report. A test that passed with no artifact is not evidence.

## 5. Cleanup

```bash
bash .agents/skills/verify-genfeed/scripts/cleanup.sh
```

Stops only dev processes whose command line sits under this checkout, removes
`playwright/artifacts/results` and the Turbopack cache, and prints `dev:status` so you
can confirm your routes are gone. It never removes the evidence directory, other
worktrees, or the shared Portless proxy. Afterwards, `ls` the evidence directory to
confirm the files survived.

## Rules

- A failing lane is a finding: report the symptom and the cause class (stack, env,
  spec, product). Never loosen an assertion or quarantine a spec to get green.
- Quarantines live in `scripts/playwright-e2e-tiers.manifest.mjs`, carry an owner and
  an expiring `reviewBy`; check it before trusting or extending one.
- The nightly `full` tier is reporting-only; release evidence is an exact-SHA green run
  (`scripts/ci/browser-suite-evidence.mjs`).
- Use Playwright, not `curl`, to probe the stack; the Portless CA is only trusted by
  Node and the browser.
