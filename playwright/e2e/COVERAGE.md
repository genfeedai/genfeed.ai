# E2E Coverage

Two complementary coverage signals back the Playwright suite:

1. **Code coverage** — % of `apps/app` + `packages/` source executed in the
   browser during the run (V8 coverage → monocart-reporter).
2. **Route coverage** — % of Next.js App Router pages that have a dedicated spec
   navigating to them.

Code coverage has a long-term **80%** target. Route references are an inventory, not a percentage gate.

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
- `lcov.info` — for CI artifacts
- `raw/` — source data for merging all four CI shards
- console summary with line / statement %

Shards collect coverage without enforcing thresholds. CI merges all four shards
before validating the report and applying the policy in
`scripts/ci/playwright-coverage.baseline.json`. This is the only threshold source;
there is no environment override. Observation mode records valid metrics without
failing for a percentage. Missing or malformed data always fails validation.

The merged `e2e-coverage-merged` artifact lasts 90 days and contains LCOV,
Istanbul `coverage-summary.json`, and `playwright-coverage-report.json` with
branch, function, line, and statement counts plus run identity and the largest
uncovered files. Counts are merged from raw V8 data before calculating metrics;
shard percentages are never averaged. These are Istanbul executable source
metrics; the per-shard V8 byte/line console summaries have different denominators
and must not be used as thresholds. The denominator is source loaded by the
mocked smoke/core browser suite, not every file in the repository.

### Baseline readiness and ratchet (#439)

After every completed master Coverage run, **Playwright Coverage Policy** reads
the latest two scheduled master Coverage runs and downloads their merged evidence.
Its readiness artifact and job summary name each blocker. Manual runs cannot
satisfy the scheduled evidence requirement. A failed scheduled run resets the
streak. #1829 must also be closed. A missing/expired artifact is missing evidence,
never a passing measurement.

Once ready, open a reviewed change setting `mode` to `enforcement`, copying
`runs`, `reports`, and `prerequisiteState` from the readiness artifact into
`baseline`, and applying its `proposedThresholds`. Each initial threshold is the
lower percentage across both runs minus 0.5 percentage points, rounded down to
two decimal places (minimum zero). The PR policy check verifies live evidence.
Enforcement compares exact merged percentages against those four thresholds.

Raise thresholds incrementally after targeted tests improve the measured report;
link follow-up issues for the largest uncovered critical files from the artifact.
Do not jump directly to 80%. Threshold decreases or disabling enforcement require
an explicit positive `exceptionIssue` and review. The policy comparison checks the
base revision, so rewriting history cannot silently lower a threshold. Readiness
never edits policy, closes issues, or enables enforcement automatically.

### Source maps

- Local `dev` mode (default) emits source maps automatically.
- For a production (`next start`) coverage run, `E2E_COVERAGE=1` also turns on
  `productionBrowserSourceMaps` in `apps/app/next.config.ts`.

---

## Route reference inventory

```bash
bun run test:e2e:routes
# = node scripts/e2e-route-coverage.mjs
```

The reporter discovers `apps/app/app/**/page.tsx`, normalises tenant prefixes and
dynamic segments, then counts exact route references in specs and page objects.
Parent and child routes receive no implicit credit. Dynamic references such as
`/posts/${id}` match `/posts/*`; unresolved route-prefix variables are not evidence
of a concrete destination.

This is static inventory, including references in excluded specs. It does not
prove that a browser navigated or an assertion passed. The generated page sweep
receives no unconditional coverage credit. Execution metrics come from the
Playwright reports described in `docs/e2e-tiers.md`.

There is no percentage gate or override. Empty discovery is an error; valid
inventory generation succeeds regardless of the percentage. Release pass/fail
comes from the required browser/API execution gates. Coverage prerequisite work
in #439 and #1849 remains separate.

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
`/test-org/~/…`, admin `/admin/…`. Auth, Better Auth and all API calls are mocked; a
strict network guard fails the test on any real outbound call.
