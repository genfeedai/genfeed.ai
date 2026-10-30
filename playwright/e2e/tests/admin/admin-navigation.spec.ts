import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { expect, test } from '../../fixtures/auth.fixture';

/**
 * Admin rail and sidebar: one rail icon per category (Platform included), the
 * back-to-app button at the bottom, and a sidebar grouped under headers.
 */
test.describe('Admin navigation', () => {
  test.setTimeout(90_000);

  const categories = [
    { id: 'admin-overview', path: APP_ROUTES.ADMIN.OVERVIEW.ROOT },
    {
      id: 'admin-customers',
      path: APP_ROUTES.ADMIN.ADMINISTRATION.USERS,
    },
    { id: 'admin-content', path: APP_ROUTES.ADMIN.CONTENT.POSTS },
    { id: 'admin-automation', path: APP_ROUTES.ADMIN.AUTOMATION.MODELS },
    { id: 'admin-economics', path: APP_ROUTES.ADMIN.ECONOMICS.REVENUE },
    { id: 'admin-platform', path: APP_ROUTES.ADMIN.SETTINGS.BILLING },
  ];

  for (const { id, path } of categories) {
    test(`lights the ${id} rail icon on ${path}`, async ({ adminPage }) => {
      await adminPage.goto(path, { waitUntil: 'domcontentloaded' });

      await expect(
        adminPage.getByTestId(`app-rail-item-${id}`),
      ).toHaveAttribute('aria-current', 'page', { timeout: 60_000 });
    });
  }

  test('keeps Platform with the other categories and leaves the app from the bottom', async ({
    adminPage,
  }) => {
    await adminPage.goto(APP_ROUTES.ADMIN.OVERVIEW.ROOT, {
      waitUntil: 'domcontentloaded',
    });

    await expect(
      adminPage
        .getByTestId('app-rail-admin-categories')
        .getByTestId('app-rail-item-admin-platform'),
    ).toBeVisible({ timeout: 60_000 });
    await expect(
      adminPage
        .getByTestId('app-rail-bottom')
        .getByTestId('app-rail-item-admin-back'),
    ).toBeVisible();
  });

  test('lists Content pages under Library and Catalog headers', async ({
    adminPage,
  }) => {
    await adminPage.goto(APP_ROUTES.ADMIN.CONTENT.POSTS, {
      waitUntil: 'domcontentloaded',
    });

    for (const header of ['Library', 'Catalog']) {
      await expect(adminPage.getByText(header, { exact: true })).toBeVisible({
        timeout: 60_000,
      });
    }
    for (const label of ['Voice Library', 'Presets', 'Tags']) {
      await expect(
        adminPage.getByRole('link', { name: label, exact: true }),
      ).toBeVisible();
    }
  });

  test('puts Learning under AI & Automation, not Platform', async ({
    adminPage,
  }) => {
    await adminPage.goto(APP_ROUTES.ADMIN.AUTOMATION.MODELS, {
      waitUntil: 'domcontentloaded',
    });

    await expect(
      adminPage.getByRole('link', { name: 'Learning', exact: true }),
    ).toBeVisible({ timeout: 60_000 });
    await expect(
      adminPage.getByRole('link', { name: 'Flags', exact: true }),
    ).toHaveCount(0);
  });
});
