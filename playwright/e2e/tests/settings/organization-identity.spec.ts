import {
  mockActiveSubscription,
  mockOrganizationIdentityDefaults,
} from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { SettingsPage } from '../../pages/settings.page';
import { selectVisibleRadixOption } from '../../utils/radix-select';

test.describe('Organization Identity Defaults', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await mockActiveSubscription(authenticatedPage, {
      credits: 1000,
      plan: 'pro',
    });
    await mockOrganizationIdentityDefaults(authenticatedPage);
  });

  test('lists only avatar source images and saves an organization default', async ({
    authenticatedPage,
  }) => {
    const settingsPage = new SettingsPage(authenticatedPage);

    await settingsPage.goToOrganization();

    await expect(settingsPage.orgIdentityCard).toBeVisible({ timeout: 30000 });
    await expect(
      authenticatedPage.getByText(/Current avatar:\s+Fallback Avatar\./),
    ).toBeVisible({ timeout: 30000 });

    await settingsPage.orgDefaultAvatarTrigger.click();
    await expect(
      authenticatedPage.locator('[role="option"]', {
        hasText: 'Avatar Source One',
      }),
    ).toBeVisible();
    await expect(
      authenticatedPage.locator('[role="option"]', {
        hasText: 'Fallback Avatar',
      }),
    ).toBeVisible();
    await expect(
      authenticatedPage.locator('[role="option"]', {
        hasText: 'Avatar Video One',
      }),
    ).toHaveCount(0);

    await selectVisibleRadixOption(
      authenticatedPage,
      settingsPage.orgDefaultAvatarTrigger,
      'Avatar Source One',
    );
    await settingsPage.saveOrgIdentityButton.click();

    await expect(
      authenticatedPage.getByText('Organization identity defaults saved'),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByText(/Current avatar:\s+Avatar Source One\./),
    ).toBeVisible();
  });
});
