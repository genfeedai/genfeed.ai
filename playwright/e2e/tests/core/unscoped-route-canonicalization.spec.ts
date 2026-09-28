import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { Response } from '@playwright/test';
import { mockActiveSubscription } from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import {
  brandPath,
  currentRoute,
  E2E_BRAND_BASE,
} from '../../utils/app-chrome';
import {
  assertNoErrorBoundaryFallback,
  expectNoErrorOverlay,
} from '../../utils/route-assertions';

/**
 * Bare protected paths enter through proxy.ts canonicalization under the
 * Playwright bypass, as they do in production (#5395): the server redirects
 * them into the mocked `test-org/brand-1` scope before the page renders, so the
 * client never resolves scope on its own.
 *
 * `canonical` is the proxy's hop. `next.config` redirects may run before it
 * (`/workspace` → `/workspace/overview`) and pages may redirect after it
 * (calendar → posts), so the whole server redirect chain is checked.
 */
function serverRedirectChain(response: Response | null): string[] {
  const chain: string[] = [];
  let request = response?.request() ?? null;
  while (request) {
    const { pathname, search } = new URL(request.url());
    chain.unshift(`${pathname}${search}`);
    request = request.redirectedFrom();
  }
  return chain;
}

const CANONICALIZED_ROUTES = [
  {
    bare: APP_ROUTES.ROOT,
    canonical: brandPath(APP_ROUTES.WORKSPACE.OVERVIEW),
  },
  {
    bare: APP_ROUTES.WORKSPACE.ROOT,
    canonical: brandPath(APP_ROUTES.WORKSPACE.OVERVIEW),
  },
  {
    bare: APP_ROUTES.WORKSPACE.TASKS,
    canonical: brandPath(APP_ROUTES.WORKSPACE.TASKS),
  },
  {
    bare: APP_ROUTES.PUBLISHING.CALENDAR,
    canonical: brandPath(APP_ROUTES.PUBLISHING.CALENDAR),
  },
];

test.describe('Unscoped route canonicalization', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await mockActiveSubscription(authenticatedPage, {
      credits: 1000,
      plan: 'pro',
    });
  });

  for (const { bare, canonical } of CANONICALIZED_ROUTES) {
    test(`${bare} redirects server-side to ${canonical}`, async ({
      authenticatedPage,
    }) => {
      const response = await authenticatedPage.goto(bare, {
        waitUntil: 'domcontentloaded',
      });

      const chain = serverRedirectChain(response);
      expect(chain[0]).toBe(bare);
      expect(
        chain,
        'the proxy, not the client, must move the request into scope',
      ).toContain(canonical);
      expect(
        chain
          .slice(0, chain.indexOf(canonical))
          .every((route) => !route.startsWith(`${E2E_BRAND_BASE}/`)),
      ).toBe(true);

      await expectNoErrorOverlay(authenticatedPage);
      await assertNoErrorBoundaryFallback(authenticatedPage, bare);
      await expect(
        authenticatedPage.getByText('Organization unavailable'),
      ).toHaveCount(0);
      expect(currentRoute(authenticatedPage)).toMatch(
        new RegExp(`^${E2E_BRAND_BASE}/`),
      );
    });
  }
});
