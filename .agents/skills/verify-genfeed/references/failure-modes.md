# Failure modes

Symptom → cause → fix. Check the stack before blaming a spec.

| Symptom | Cause | Fix |
|---|---|---|
| `dev:backend:min` fails at `//#env:check` with "Deprecated env keys detected" | A stale source `.env.local` copied by `wt:sync` carries keys listed in `DEPRECATED_ENV_KEYS` (`scripts/env-spec.ts`) | Delete those key lines from the worktree copies of `.env.local` and `apps/server/api/.env.local` only; rerun `bun run env:check` |
| Protected routes 500 with `Can't resolve '@genfeedai/serializers/request-runtime'` | `packages/serializers/dist` not built; Next's import map points at `dist/request-runtime.bundle.js` | `bunx turbo run build --filter=@genfeedai/serializers` |
| Playwright `fetch failed` / `self-signed certificate` against `*.genfeed.localhost` | Node does not trust the Portless CA | `export NODE_EXTRA_CA_CERTS=$HOME/.portless/ca.pem` |
| `better-auth-setup` cannot sign up | Authed lane pointed at the wrong API, or API not up | Set `E2E_API_ENDPOINT` and `NEXT_PUBLIC_API_ENDPOINT` to the worktree's `api` route plus `/v1`; confirm in `dev:status` |
| Authed project reports no tests | `app-authed` is opt-in | `E2E_AUTHED_LOCAL=1` (use `bun run test:e2e:authed:local`) |
| Mocked spec redirects to `/login` | Mock layers registered in the wrong order | Call `setupApiMocks` before `setupBetterAuthMocks`; routes resolve last-registered-first |
| Mocked spec fails with a blocked-request assertion | A real external call escaped the network guard | Mock the call; the guard aborts cost-risk hosts on purpose |
| Credit or billing UI missing in a mocked run | Community build gates credit reads behind `hasOrganizationBillingHint()` | Use the `cloud/` specs with `NEXT_PUBLIC_GENFEED_E2E_DEPLOYMENT=cloud` |
| `ENOSPC` after many dev runs | Turbopack persistent cache (`apps/web/.next/dev/cache`) grows to ~15 GB | `cleanup.sh` removes it; `scripts/dev/cleanup-playwright-cache.ts` does the same after Playwright-owned servers |
| No screenshot after a green run | Config keeps screenshots `only-on-failure` | Use `scripts/capture.ts` in this skill |
| Port or route already taken | Another repo's dev server owns the name (`FOREIGN` in `dev:status`) | Use your worktree's prefixed host; never kill the shared proxy |
| Slow first load (minutes) | Turbopack compiles routes on demand | Raise timeouts for first navigation, then rerun |

When none of these fit, read the backend and app logs before reading the spec.
