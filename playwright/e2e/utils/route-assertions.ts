import { expect, type Page, type Response } from '@playwright/test';

/**
 * Shared Route Render Assertions for E2E Tests
 *
 * Provides a single, robust "does this route render?" check used by the
 * dedicated per-area route specs. Mirrors the proven logic in
 * `e2e/tests/smoke/all-app-pages.spec.ts` so every spec asserts the same
 * health signals: real HTTP response, no framework error overlay, no caught
 * application ErrorBoundary fallback, no redirect to login, and a non-blank
 * body.
 *
 * @module route-assertions
 */

interface AssertRouteOptions {
  /** Allow the route to bounce to /login (used for unauthenticated checks). */
  allowRedirectToLogin?: boolean;
  /** Navigation timeout in ms. */
  timeout?: number;
}

/**
 * Selector for the marker shared by every application ErrorBoundary fallback:
 * `packages/ui/src/components/error/ErrorBoundary` (and the components that
 * delegate to it, e.g. `@ui/display/error-boundary/ErrorBoundary`), the
 * Next.js `error.tsx` / `global-error.tsx` route boundaries, and the two
 * boundary-like gates that render `ErrorFallback` directly for an
 * unrecoverable, page-blocking failure (`routed-organization-boundary.tsx`'s
 * `failed` status and the workspace segment's `error.tsx`).
 *
 * Deliberately NOT present on a component's own handled loading, empty, or
 * recoverable request-error UI (e.g. a list's "could not load, retry"
 * state) — those are valid product states, not a caught render exception.
 */
export const ERROR_BOUNDARY_FALLBACK_SELECTOR =
  '[data-testid="error-boundary-fallback"]';

/**
 * Asserts the current page did not render an application ErrorBoundary
 * fallback. The framework's own error overlay only fires for a raw, uncaught
 * exception — a React ErrorBoundary catches the same exception and renders a
 * normal-looking page, so a route smoke that checks only for the overlay and
 * a non-blank body can stay green while the app is actually broken (#5070).
 *
 * @param page - Playwright page, already navigated to `route`
 * @param route - The route being checked, used only for the failure message
 */
export async function assertNoErrorBoundaryFallback(
  page: Page,
  route: string,
): Promise<void> {
  await expect(
    page.locator(ERROR_BOUNDARY_FALLBACK_SELECTOR),
    `${route} rendered an application error boundary`,
  ).toHaveCount(0, { timeout: 1_000 });
}

/**
 * Navigates to a route and asserts it renders without errors.
 *
 * @param page - Playwright page (use authenticatedPage / adminPage fixtures)
 * @param route - Absolute path to visit (e.g. '/test-org/brand-1/library/images')
 * @param options - Optional behaviour overrides
 */
export async function assertRouteRenders(
  page: Page,
  route: string,
  options: AssertRouteOptions = {},
): Promise<void> {
  const { allowRedirectToLogin = false, timeout = 30_000 } = options;

  const response: Response | null = await page.goto(route, {
    timeout,
    waitUntil: 'domcontentloaded',
  });

  expect(response?.status() ?? 0, `${route} returned HTTP error`).toBeLessThan(
    400,
  );

  await expect(
    page.locator('[data-nextjs-dialog]'),
    `${route} rendered a framework error overlay`,
  ).toHaveCount(0, { timeout: 1_000 });

  await assertNoErrorBoundaryFallback(page, route);

  if (!allowRedirectToLogin) {
    expect(page.url(), `${route} redirected to login`).not.toMatch(/\/login/);
  }

  const bodySignal = await page.locator('body').evaluate((body) => {
    const visibleNodes = Array.from(body.querySelectorAll('*')).filter(
      (element) => {
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();

        return (
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          rect.width > 0 &&
          rect.height > 0
        );
      },
    );

    return {
      textLength: body.textContent?.trim().length ?? 0,
      visibleNodeCount: visibleNodes.length,
    };
  });

  expect(
    bodySignal.textLength + bodySignal.visibleNodeCount,
    `${route} rendered a blank body`,
  ).toBeGreaterThan(0);
}

/**
 * Best-effort click on the first matching, visible locator. Never throws — used
 * to exercise interactive code paths (tabs, filters, menus) for coverage
 * without making route specs brittle.
 *
 * @param page - Playwright page
 * @param selector - CSS / text selector to attempt
 */
export async function tryClick(page: Page, selector: string): Promise<boolean> {
  const target = page.locator(selector).first();
  const visible = await target.isVisible().catch(() => false);

  if (!visible) {
    return false;
  }

  await target.click({ timeout: 5_000 }).catch(() => {});
  return true;
}

/**
 * Asserts the current page is not showing a framework/runtime error overlay.
 *
 * @param page - Playwright page
 */
export async function expectNoErrorOverlay(page: Page): Promise<void> {
  await expect(page.locator('[data-nextjs-dialog]')).toHaveCount(0, {
    timeout: 1_000,
  });
}
