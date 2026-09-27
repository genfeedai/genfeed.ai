import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { ISetting } from '@genfeedai/contracts/interfaces';
import type { Page, Route } from '@playwright/test';
import { mockActiveSubscription } from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { SettingsPage } from '../../pages/settings.page';
import { selectVisibleRadixOption } from '../../utils/radix-select';

/**
 * E2E Tests for Personal Settings
 *
 * Personal settings (settings-profile-page.tsx) shows the signed-in identity
 * read-only — name and email come from the auth session, with no editable
 * name/bio form or avatar upload (read-only since the page entered this
 * monorepo in 2df1de337) — plus persisted preferences: language, appearance,
 * Advanced Mode and the default Agent mode. All API calls are mocked.
 *
 * The auth fixture signs in "Test User" <test@genfeed.ai>.
 */
const USER_NAME = 'Test User';
const USER_EMAIL = 'test@genfeed.ai';
const ME_SETTINGS_PATTERN = '**/api.genfeed.ai/v1/users/me/settings';

/**
 * Capture PATCH /users/me/settings bodies and answer with `status`.
 */
async function mockMeSettingsPatch(
  page: Page,
  status: 200 | 500,
): Promise<Partial<ISetting>[]> {
  const patches: Partial<ISetting>[] = [];

  await page.route(ME_SETTINGS_PATTERN, async (route: Route) => {
    if (route.request().method() !== 'PATCH') {
      await route.fallback();
      return;
    }

    const body = route.request().postDataJSON() as {
      data?: { attributes?: Partial<ISetting> };
    };
    const attributes = body.data?.attributes ?? {};
    patches.push(attributes);

    await route.fulfill({
      body: JSON.stringify(
        status === 200
          ? { data: { attributes, id: 'setting-1', type: 'setting' } }
          : { errors: [{ status: '500', title: 'Internal Server Error' }] },
      ),
      contentType: 'application/json',
      status,
    });
  });

  return patches;
}

test.describe('Personal Settings', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await mockActiveSubscription(authenticatedPage, {
      credits: 1000,
      plan: 'pro',
    });
  });

  test.describe('Page Load', () => {
    test('redirects bare /settings to personal settings', async ({
      authenticatedPage,
    }) => {
      const settingsPage = new SettingsPage(authenticatedPage);

      await settingsPage.goto();

      await expect(settingsPage.profileSection).toBeVisible();
    });

    test('shows the account settings navigation', async ({
      authenticatedPage,
    }) => {
      const settingsPage = new SettingsPage(authenticatedPage);

      await settingsPage.goto();

      for (const name of ['Personal', 'Notifications', 'Progress', 'Help']) {
        await expect(
          settingsPage.settingsNav.getByRole('link', { exact: true, name }),
        ).toBeVisible();
      }
    });
  });

  test.describe('Profile Identity', () => {
    test('displays the signed-in name and email read-only', async ({
      authenticatedPage,
    }) => {
      const settingsPage = new SettingsPage(authenticatedPage);

      await settingsPage.goto();

      await expect(settingsPage.profileSection).toBeVisible();
      await expect(
        settingsPage.canvas.getByText(USER_NAME, { exact: true }),
      ).toBeVisible();
      await expect(
        settingsPage.canvas.getByText(USER_EMAIL, { exact: true }),
      ).toBeVisible();
      // Identity is owned by the auth provider: the page offers no text
      // field to edit it.
      await expect(settingsPage.canvas.getByRole('textbox')).toHaveCount(0);
    });

    test('shows the account avatar in the sidebar account menu', async ({
      authenticatedPage,
    }) => {
      const settingsPage = new SettingsPage(authenticatedPage);

      await settingsPage.goto();

      await expect(settingsPage.accountMenuAvatar).toBeVisible();
      await expect(settingsPage.accountMenuAvatar).toHaveAccessibleName(
        USER_NAME,
      );
    });
  });

  test.describe('Preferences', () => {
    test('persists the default agent mode', async ({ authenticatedPage }) => {
      const settingsPage = new SettingsPage(authenticatedPage);
      const patches = await mockMeSettingsPatch(authenticatedPage, 200);

      await settingsPage.goto();
      await expect(settingsPage.agentModeTrigger).toContainText('Manual');

      await selectVisibleRadixOption(
        authenticatedPage,
        settingsPage.agentModeTrigger,
        'Plan',
      );

      await expect.poll(() => patches).toEqual([{ agentMode: 'plan' }]);
      await expect(
        settingsPage.canvas.getByText(/^Plan — the Agent drafts a plan/),
      ).toBeVisible();
    });

    test('persists the appearance preference', async ({
      authenticatedPage,
    }) => {
      const settingsPage = new SettingsPage(authenticatedPage);
      const patches = await mockMeSettingsPatch(authenticatedPage, 200);

      await settingsPage.goto();
      await expect(settingsPage.appearanceTrigger).toContainText('Dark');

      await selectVisibleRadixOption(
        authenticatedPage,
        settingsPage.appearanceTrigger,
        'Light',
      );

      await expect.poll(() => patches).toEqual([{ theme: 'light' }]);
      await expect(settingsPage.appearanceTrigger).toContainText('Light');
      await expect(
        authenticatedPage.getByText(
          'Failed to save your appearance preference.',
        ),
      ).toHaveCount(0);
    });

    test('reverts the appearance and reports an error when saving fails', async ({
      authenticatedPage,
    }) => {
      const settingsPage = new SettingsPage(authenticatedPage);
      const patches = await mockMeSettingsPatch(authenticatedPage, 500);

      await settingsPage.goto();
      await expect(settingsPage.appearanceTrigger).toContainText('Dark');

      // Not selectVisibleRadixOption: it expects the trigger to keep the new
      // value, but a failed save reverts it.
      await settingsPage.appearanceTrigger.click();
      await authenticatedPage
        .getByRole('option', { exact: true, name: 'Light' })
        .click();

      await expect(
        authenticatedPage.getByText(
          'Failed to save your appearance preference.',
        ),
      ).toBeVisible();
      await expect.poll(() => patches).toEqual([{ theme: 'light' }]);
      await expect(settingsPage.appearanceTrigger).toContainText('Dark');
    });
  });

  test.describe('Settings Navigation', () => {
    test('navigates to notifications settings from the sidebar', async ({
      authenticatedPage,
    }) => {
      const settingsPage = new SettingsPage(authenticatedPage);

      await settingsPage.goto();
      await settingsPage.navigateFromSidebar(
        'Notifications',
        APP_ROUTES.SETTINGS.NOTIFICATIONS,
      );

      await expect(
        settingsPage.canvas.getByRole('heading', {
          exact: true,
          name: 'Email Notifications',
        }),
      ).toBeVisible();
      await expect(
        settingsPage.canvas.getByRole('switch', { name: 'Workflow Emails' }),
      ).toBeVisible();
    });

    test('opens organization billing settings', async ({
      authenticatedPage,
    }) => {
      const settingsPage = new SettingsPage(authenticatedPage);

      // Billing lives in the Organization scope, which the Account sidebar
      // does not link to; goToBilling() switches scope by URL.
      await settingsPage.goToBilling();

      await expect(
        settingsPage.canvas.getByRole('heading', {
          exact: true,
          level: 1,
          name: 'Credits',
        }),
      ).toBeVisible();
      await expect(
        settingsPage.canvas.getByRole('heading', {
          exact: true,
          name: 'Balance',
        }),
      ).toBeVisible();
    });
  });

  test.describe('Responsive Design', () => {
    for (const viewport of [
      { height: 667, name: 'mobile', width: 375 },
      { height: 1024, name: 'tablet', width: 768 },
    ]) {
      test(`displays personal settings on ${viewport.name} viewport`, async ({
        authenticatedPage,
      }) => {
        const settingsPage = new SettingsPage(authenticatedPage);

        await authenticatedPage.setViewportSize({
          height: viewport.height,
          width: viewport.width,
        });
        await settingsPage.goto();

        await expect(settingsPage.profileSection).toBeVisible();
        await expect(
          settingsPage.canvas.getByText(USER_EMAIL, { exact: true }),
        ).toBeVisible();
        await expect(settingsPage.appearanceTrigger).toBeVisible();
      });
    }
  });
});
