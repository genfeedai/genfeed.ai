# E2E Coverage

Two complementary coverage signals back the Playwright suite:

1. **Code coverage** — % of `apps/app` + `packages/` source executed in the
   browser during the run (V8 coverage → monocart-reporter).
2. **Route coverage** — % of Next.js App Router pages that have a dedicated spec
   navigating to them.

Both target **≥ 80%**.

---

## Code coverage

Coverage is collected per-test by `e2e/fixtures/coverage.fixture.ts`, which is
the base every spec's `test` extends (via `auth.fixture.ts`). It is:

- **opt-in** — only active when `E2E_COVERAGE=1` (normal `test:e2e` is untouched);
- **Chromium-only** — V8 coverage is a CDP feature; a no-op elsewhere;
- **dependency-light** — `monocart-reporter` is imported dynamically, so a normal
  run never needs it.

### Run it

```bash
bun run test:e2e:coverage
# = E2E_COVERAGE=1 playwright test --config=playwright-coverage.config.ts
```

Outputs under `playwright-report/coverage/`:

- `index.html` — interactive V8 report (source-mapped to TypeScript)
- `lcov.info` — for CI / Codecov
- console summary with line / statement %

The run **fails** if coverage drops below the threshold. Override with
`E2E_COVERAGE_THRESHOLD=85 bun run test:e2e:coverage`.

### Source maps

- Local `dev` mode (default) emits source maps automatically.
- For a production (`next start`) coverage run, `E2E_COVERAGE=1` also turns on
  `productionBrowserSourceMaps` in `apps/app/next.config.ts`.

---

## Route coverage

```bash
bun run test:e2e:routes
# = node scripts/e2e-route-coverage.mjs
```

The reporter discovers every `apps/app/app/**/page.tsx`, normalises the tenant
prefix and dynamic segments, then matches them against the routes navigated by
specs (direct `.goto()` plus `routes = [...]` arrays passed to
`assertRouteRenders`). It prints:

- **Dedicated coverage** — routes reached by an explicit per-area spec (the
  metric we grow on purpose; this is what the gate checks).
- **Effective coverage** — also counts the generated `all-app-pages.spec.ts`
  sweep, which navigates every discovered page (so it is ~100% by construction).

Gate options:

```bash
E2E_ROUTE_COVERAGE_THRESHOLD=80   # percentage, default 80
E2E_ROUTE_COVERAGE_MODE=effective # gate on effective instead of dedicated
```

Exit code is non-zero below threshold.

---

## Writing new route specs

Use the shared helpers so every spec asserts the same health signals:

```ts
import { expect, test } from '../../fixtures/auth.fixture';
import { assertRouteRenders, tryClick } from '../../utils/route-assertions';

const BRAND = '/test-org/brand-1';

test.describe('My Area', () => {
  test.setTimeout(60_000);

  const routes = [`${BRAND}/my-area`, `${BRAND}/my-area/detail`];

  for (const route of routes) {
    test(`renders ${route}`, async ({ authenticatedPage }) => {
      await assertRouteRenders(authenticatedPage, route);
    });
  }

  test('stays interactive', async ({ authenticatedPage }) => {
    await assertRouteRenders(authenticatedPage, `${BRAND}/my-area`);
    await tryClick(authenticatedPage, '[role="tab"]'); // never throws
    await expect(authenticatedPage.locator('body')).toBeVisible();
  });
});
```

Fixtures (from `auth.fixture.ts`): `authenticatedPage` (brand member),
`adminPage` (`/admin/*`), `automationPage`, `unauthenticatedPage`. Tenant slugs
are `test-org` / `brand-1`; brand routes are `/test-org/brand-1/…`, org routes
`/test-org/~/…`, admin `/admin/…`. Auth, Clerk and all API calls are mocked; a
strict network guard fails the test on any real outbound call.
