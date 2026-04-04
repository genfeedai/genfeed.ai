import {
  mockActiveSubscription,
  mockBrandIdentityDefaults,
} from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { BrandsPage } from '../../pages/brands.page';
import { selectVisibleRadixOption } from '../../utils/radix-select';

test.describe('Brand Identity Defaults', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await mockActiveSubscription(authenticatedPage, {
      credits: 1000,
      plan: 'pro',
    });
    await mockBrandIdentityDefaults(authenticatedPage);
  });

  test('shows organization fallback and lets a brand override the avatar default', async ({
    authenticatedPage,
  }) => {
    const brandsPage = new BrandsPage(authenticatedPage);

    await brandsPage.gotoBrandDetail('brand-1');

    await expect(brandsPage.brandIdentityCard).toBeVisible({ timeout: 30000 });
    await expect(
      authenticatedPage.getByText(
        'This brand is currently using organization identity defaults.',
      ),
    ).toBeVisible({ timeout: 30000 });
    await expect(
      authenticatedPage.getByText(/Current avatar:\s+Fallback Avatar\./),
    ).toBeVisible({ timeout: 30000 });

    await brandsPage.brandDefaultAvatarTrigger.click();
    await expect(
      authenticatedPage.locator('[role="option"]', {
        hasText: 'Avatar Source One',
      }),
    ).toBeVisible();
    await expect(
      authenticatedPage.locator('[role="option"]', {
        hasText: 'Avatar Video One',
      }),
    ).toHaveCount(0);

    await selectVisibleRadixOption(
      authenticatedPage,
      brandsPage.brandDefaultAvatarTrigger,
      'Avatar Source One',
    );
    await brandsPage.saveBrandIdentityButton.click();

    await expect(
      authenticatedPage.getByText('Brand identity defaults saved'),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByText(/Current avatar:\s+Avatar Source One\./),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByText(
        'This brand is currently using organization identity defaults.',
      ),
    ).toHaveCount(0);
  });
});
