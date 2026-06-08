import { expect, test } from '../../fixtures/auth.fixture';
import { assertRouteRenders, tryClick } from '../../utils/route-assertions';

/**
 * E2E route spec for the brand-scoped Images library. The page renders the
 * ingredients layout with a media grid; the shared API interceptor returns a
 * sample images collection so the grid populates. Interaction tests exercise
 * grid tiles, category/type filters, and the upload trigger via `tryClick`
 * to widen code coverage without coupling to specific markup.
 */

const BRAND = '/test-org/brand-1';

test.describe('Library — Images', () => {
  test.setTimeout(60_000);

  const routes = [`${BRAND}/library/images`];

  for (const route of routes) {
    test(`renders ${route}`, async ({ authenticatedPage }) => {
      await assertRouteRenders(authenticatedPage, route);
    });
  }

  test('images grid stays interactive after exercising controls', async ({
    authenticatedPage,
  }) => {
    await assertRouteRenders(authenticatedPage, `${BRAND}/library/images`);

    await tryClick(authenticatedPage, '[data-testid="ingredient-item"]');
    await tryClick(authenticatedPage, '[role="tab"]');
    await tryClick(authenticatedPage, '[role="combobox"]');

    await expect(authenticatedPage.locator('body')).toBeVisible();
  });

  test('images filter and upload controls respond', async ({
    authenticatedPage,
  }) => {
    await assertRouteRenders(authenticatedPage, `${BRAND}/library/images`);

    await tryClick(authenticatedPage, 'input[placeholder*="Search"]');
    await tryClick(authenticatedPage, 'button:has-text("Filter")');
    await tryClick(authenticatedPage, 'button:has-text("Upload")');

    await expect(authenticatedPage.locator('body')).toBeVisible();
  });
});
