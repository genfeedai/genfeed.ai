import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { expect, test } from '../../fixtures/auth.fixture';
import { assertRouteRenders } from '../../utils/route-assertions';

/**
 * Dedicated navigations for the legacy long-form editor aliases.
 * New operator navigation uses `/publishing/posts/{id}`; these routes stay
 * reachable for existing deep links.
 */
const ORG_BRAND = '/test-org/brand-1';

test.describe('Legacy editors', () => {
  test.setTimeout(60_000);

  test('renders /edit/article/:id', async ({ authenticatedPage }) => {
    await assertRouteRenders(
      authenticatedPage,
      `${ORG_BRAND}${APP_ROUTES.EDIT.ARTICLE}/mock-id`,
    );
    await expect(authenticatedPage.locator('body')).toBeVisible();
  });

  test('renders /edit/newsletter/:id', async ({ authenticatedPage }) => {
    await assertRouteRenders(
      authenticatedPage,
      `${ORG_BRAND}${APP_ROUTES.EDIT.NEWSLETTER}/mock-id`,
    );
    await expect(authenticatedPage.locator('body')).toBeVisible();
  });
});
