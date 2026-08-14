import { expect, test } from '../../fixtures/auth.fixture';
import { assertRouteRenders } from '../../utils/route-assertions';

/**
 * Dedicated navigation for the PWA offline fallback route.
 */
test.describe('Offline fallback', () => {
  test.setTimeout(60_000);

  test('renders /~offline', async ({ unauthenticatedPage }) => {
    await assertRouteRenders(unauthenticatedPage, '/~offline', {
      allowRedirectToLogin: true,
    });
    await expect(unauthenticatedPage.locator('body')).toBeVisible();
  });
});
