import { APP_ROUTES } from '@genfeedai/constants';
import { expect, test } from '../../fixtures/auth.fixture';
import { assertRouteRenders } from '../../utils/route-assertions';

/**
 * Dedicated navigations for the legacy long-form editor aliases.
 * New operator navigation uses `/publish/posts/{id}`; these routes stay
 * reachable for existing deep links.
 */
test.describe('Legacy editors', () => {
  test.setTimeout(60_000);

  test('renders /edit/article/:id', async ({ authenticatedPage }) => {
    await assertRouteRenders(
      authenticatedPage,
      `${APP_ROUTES.EDIT.ARTICLE}/mock-id`,
    );
    await expect(authenticatedPage.locator('body')).toBeVisible();
  });

  test('renders /edit/newsletter/:id', async ({ authenticatedPage }) => {
    await assertRouteRenders(
      authenticatedPage,
      `${APP_ROUTES.EDIT.NEWSLETTER}/mock-id`,
    );
    await expect(authenticatedPage.locator('body')).toBeVisible();
  });
});
