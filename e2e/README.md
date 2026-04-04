# Playwright runtime modes

Playwright E2E has two supported startup modes:

- `default`: Playwright manages startup through `webServer` and reuses an existing listener when available.
- `manual`: set `PLAYWRIGHT_SKIP_WEBSERVER=1` only when you are intentionally running the target app(s) yourself.

The default mode is the canonical path for both localhost and CI.

Readiness contract:

- app readiness URL: `http://127.0.0.1:3102/playwright-ready`
- admin readiness URL: `http://127.0.0.1:3101/playwright-ready`

Those endpoints are unauthenticated and are used only to determine whether the web app is up. Auth fixtures may still navigate to protected routes after session setup, but protected pages are not used as server health probes.
