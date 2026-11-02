import {
  mockActiveSubscription,
  mockBrandWithMedia,
} from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { brandPath } from '../../utils/app-chrome';
import { assertNoErrorBoundaryFallback } from '../../utils/route-assertions';

// A brand banner is the X header format (1500x500, 3:1); the logo tile is the
// same bordered square wherever the brand is shown.
test.describe('Brand logo and banner frames', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await mockActiveSubscription(authenticatedPage, {
      credits: 1000,
      plan: 'pro',
    });
    await mockBrandWithMedia(authenticatedPage);
  });

  test('the brand page shows the banner at 3:1 and the logo as a square tile', async ({
    authenticatedPage,
  }) => {
    const route = brandPath('/settings');
    await authenticatedPage.goto(route, {
      timeout: 60000,
      waitUntil: 'domcontentloaded',
    });
    await assertNoErrorBoundaryFallback(authenticatedPage, route);

    const banner = authenticatedPage.getByRole('img', {
      name: 'Brand 1 banner',
    });
    await expect(banner).toBeVisible({ timeout: 30000 });
    const bannerFrame = await banner.locator('xpath=..').boundingBox();
    expect(bannerFrame).not.toBeNull();
    expect((bannerFrame?.width ?? 0) / (bannerFrame?.height ?? 1)).toBeCloseTo(
      3,
      1,
    );

    const logo = authenticatedPage.getByRole('img', { name: 'Brand 1 logo' });
    await expect(logo).toBeVisible({ timeout: 30000 });
    const logoTile = await logo.locator('xpath=..').boundingBox();
    expect(logoTile?.width).toBe(logoTile?.height);
  });

  test('the brand switcher draws the same tile for a logo as for initials', async ({
    authenticatedPage,
  }) => {
    const route = brandPath('/settings');
    await authenticatedPage.goto(route, {
      timeout: 60000,
      waitUntil: 'domcontentloaded',
    });

    await authenticatedPage
      .getByRole('button', { name: 'Switch brand' })
      .first()
      .click();
    const rowTile = authenticatedPage
      .getByRole('option', { name: /Brand 1/ })
      .locator('[data-shape="square"]')
      .first();
    await expect(rowTile).toBeVisible({ timeout: 30000 });
    await expect(rowTile).toHaveCSS('outline-style', 'solid');
  });
});
