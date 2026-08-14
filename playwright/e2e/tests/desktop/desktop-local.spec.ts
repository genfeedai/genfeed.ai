import { expect, test } from '../../fixtures/auth.fixture';
import { assertRouteRenders } from '../../utils/route-assertions';

/**
 * Dedicated navigation for the desktop local-workspace landing page.
 * Auth is mocked; the page is public and must render without a backend.
 */
test.describe('Desktop local workspace', () => {
  test.setTimeout(60_000);

  test('renders /desktop/local', async ({ unauthenticatedPage }) => {
    await assertRouteRenders(unauthenticatedPage, '/desktop/local', {
      allowRedirectToLogin: true,
    });
    await expect(unauthenticatedPage.locator('body')).toBeVisible();
  });
});
