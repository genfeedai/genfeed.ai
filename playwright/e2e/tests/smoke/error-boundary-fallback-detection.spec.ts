import { expect, test } from '@playwright/test';
import {
  assertNoErrorBoundaryFallback,
  ERROR_BOUNDARY_FALLBACK_SELECTOR,
} from '../../utils/route-assertions';

/**
 * Regression coverage for #5070.
 *
 * The route smoke helper (`assertRouteLoads` in all-app-pages.spec.ts /
 * all-app-pages.authed.spec.ts) only checked for the framework's own error
 * overlay and a non-blank body. Both checks stay green when the app's own
 * ErrorBoundary catches a render exception and renders a normal-looking
 * fallback page — that's the whole point of a React ErrorBoundary. During the
 * Cost Summary fixture defect (#5069), CostUsagePage threw inside
 * usageDailySeries(undefined, ...) while the smoke sweep stayed green.
 *
 * `assertNoErrorBoundaryFallback` is the shared fix: it fails when the page
 * carries the marker every application ErrorBoundary fallback now renders
 * (`packages/ui/src/components/error/ErrorBoundary`, the Next.js `error.tsx`
 * / `global-error.tsx` boundaries, and the two boundary-like gates that render
 * `ErrorFallback` directly for an unrecoverable, page-blocking failure).
 *
 * These tests prove the check both ways without shipping a throwing page into
 * production code: `page.setContent` stands in for "the app rendered X",
 * which is enough to exercise the assertion's own logic deterministically.
 */
test.describe('assertNoErrorBoundaryFallback (#5070)', () => {
  test('fails when the page rendered the shared ErrorBoundary fallback', async ({
    page,
  }) => {
    await page.setContent(
      `<body><div data-testid="error-boundary-fallback" role="alert">Something went wrong</div></body>`,
    );

    await expect(
      assertNoErrorBoundaryFallback(page, '/fixture-route'),
    ).rejects.toThrow(/rendered an application error boundary/);
  });

  test('passes for a normal page with no error boundary fallback', async ({
    page,
  }) => {
    await page.setContent(
      `<body><main data-testid="workspace-overview">All good</main></body>`,
    );

    await expect(
      assertNoErrorBoundaryFallback(page, '/fixture-route'),
    ).resolves.toBeUndefined();
  });

  test('passes when the page shows an unrelated, non-boundary error message', async ({
    page,
  }) => {
    // Guards against over-matching: a component's own handled
    // loading/empty/recoverable-request-error UI (e.g. a list's "could not
    // load, retry" state) must keep passing — only the shared ErrorBoundary
    // marker should trip the check.
    await page.setContent(
      `<body><div role="alert" data-testid="list-load-error">Could not load. Retry?</div></body>`,
    );

    await expect(
      assertNoErrorBoundaryFallback(page, '/fixture-route'),
    ).resolves.toBeUndefined();
  });

  test('selector matches the marker rendered by the shared ErrorBoundary', () => {
    expect(ERROR_BOUNDARY_FALLBACK_SELECTOR).toBe(
      '[data-testid="error-boundary-fallback"]',
    );
  });
});
