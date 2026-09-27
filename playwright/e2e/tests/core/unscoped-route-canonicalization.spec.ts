import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { mockActiveSubscription } from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { brandPath, currentRoute } from '../../utils/app-chrome';
import {
  assertNoErrorBoundaryFallback,
  expectNoErrorOverlay,
} from '../../utils/route-assertions';

/**
 * Bare protected paths enter through proxy.ts canonicalization under the
 * Playwright bypass, as they do in production (#5395): the server redirects
 * them into the mocked `test-org/brand-1` scope before the page renders, so the
 * client never resolves scope on its own.
 */
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
    bare: `${APP_ROUTES.PUBLISHING.CALENDAR}?view=week`,
    canonical: `${brandPath(APP_ROUTES.PUBLISHING.CALENDAR)}?view=week`,
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

      const redirectedFrom = response?.request().redirectedFrom();
      expect(
        redirectedFrom ? new URL(redirectedFrom.url()).pathname : null,
        'the proxy, not the client, must move the request into scope',
      ).toBe(new URL(bare, 'http://localhost').pathname);
      expect(currentRoute(authenticatedPage)).toBe(canonical);

      await expectNoErrorOverlay(authenticatedPage);
      await assertNoErrorBoundaryFallback(authenticatedPage, bare);
      await expect(
        authenticatedPage.getByText('Organization unavailable'),
      ).toHaveCount(0);
      expect(currentRoute(authenticatedPage)).toBe(canonical);
    });
  }
});
