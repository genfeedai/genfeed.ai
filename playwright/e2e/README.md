# Playwright runtime modes

Playwright E2E has two supported startup modes:

- `default`: Playwright manages startup through `webServer` and reuses an existing listener when available.
- `manual`: set `PLAYWRIGHT_SKIP_WEBSERVER=1` only when you are intentionally running the target app(s) yourself.

The default mode is the canonical path for both localhost and CI.

Readiness contract:

- app readiness URL: `http://127.0.0.1:3102/playwright-ready`
- admin readiness URL: `http://127.0.0.1:3101/playwright-ready`

Those endpoints are unauthenticated and are used only to determine whether the web app is up. Auth fixtures may still navigate to protected routes after session setup, but protected pages are not used as server health probes.

## Recorded API responses (#6231)

Hand-written API mocks drift from what the real serializers emit. Surfaces that
have been converted get every API response from a recording instead
(`playwright/e2e/recordings/<surface>.recording.json`), served by
`installRecordedApi(page, '<surface>')` from `utils/recorded-api/recorded-api.ts`.

```ts
const recorded = await installRecordedApi(page, 'admin-automation');
// ...drive the page...
recorded.assertAllRequestsMatched(); // throws naming each unmatched "METHOD /path"
```

**Replay (default, and the only mode in CI).** A request the recording has no
response for is answered with a 599 and reported by `assertAllRequestsMatched`,
which names the method and path and points back here. A stale recording
therefore fails the spec that uses it instead of serving drifted data.

**Granularity.** One recording file per surface. An entry is keyed by
`METHOD path?sorted-query`. Repeated entries for one key replay in recorded
order and the last one repeats, so a polling page keeps receiving the final
state.

**Record (local only).** `E2E_RECORD=1` forwards each request to the seeded
backend at `E2E_RECORD_API_ORIGIN` (default: the configured API origin), stores
the response, and `recorded.finish()` writes the file. Call `finish()` from an
`afterEach`. `E2E_RECORD=1` throws when `CI` is set. Before writing, ids,
timestamps and signed URLs are normalized (`id-1`, `2026-01-01T00:00:00.000Z`,
`?signed=redacted`) so a re-recording only diffs when the response shape
changed, and the safety scan below runs.

**Public repo, fixture data only.** Recordings are committed here, so
`bun run check:e2e-recordings` (CI, and lint-staged before commit) rejects a
recording that holds a JWT or other token, a key under a sensitive field name,
an email outside `example.*` / `genfeed.localhost`, or a hostname outside
`localhost`, `*.genfeed.localhost`, `example.*` and `cdn.genfeed.ai`.

**Not recorded.** Server-sent events and WebSockets. Record mode throws on a
`text/event-stream` response, so a streaming surface keeps a hand-written mock
for that endpoint. Deliberate error and edge cases (a 500, an empty list) also
stay hand-written.

**Seed coverage.** Which seeded data a surface needs is settled per surface as
it is converted (#7427, #7428); the safety scan is the backstop, not the seed.

**Retries and flakes.** CI allows one retry (`playwright.config.ts` clamps
`E2E_RETRIES` to 1 in CI). Tests that passed only on the retry are listed under
"Flaky tests (passed on retry)" in the run summary of the merged E2E report and
of the full-tier nightly.
