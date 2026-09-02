import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { expect, test } from '../../fixtures/auth.fixture';
import { assertRouteRenders, tryClick } from '../../utils/route-assertions';

/**
 * E2E route-render coverage for the Admin Configuration section.
 *
 * Uses the adminPage fixture (admin routes are not tenant-scoped). All API and
 * Better Auth calls are mocked; unknown API routes auto-return empty collections so
 * each page renders without bespoke mocks.
 */
test.describe('Admin Configuration', () => {
  test.setTimeout(90_000);

  const routes = [
    APP_ROUTES.ADMIN.CONFIGURATION.ELEMENTS_BLACKLISTS,
    APP_ROUTES.ADMIN.CONFIGURATION.ELEMENTS_CAMERA_MOVEMENTS,
    APP_ROUTES.ADMIN.CONFIGURATION.ELEMENTS_CAMERAS,
    APP_ROUTES.ADMIN.CONFIGURATION.ELEMENTS_LENSES,
    APP_ROUTES.ADMIN.CONFIGURATION.ELEMENTS_LIGHTINGS,
    APP_ROUTES.ADMIN.CONFIGURATION.ELEMENTS_MOODS,
    APP_ROUTES.ADMIN.CONFIGURATION.ELEMENTS_SCENES,
    APP_ROUTES.ADMIN.CONFIGURATION.ELEMENTS_SOUNDS,
    APP_ROUTES.ADMIN.CONFIGURATION.ELEMENTS_STYLES,
    APP_ROUTES.ADMIN.CONFIGURATION.FONT_FAMILIES,
    APP_ROUTES.ADMIN.CONFIGURATION.PRESETS,
    APP_ROUTES.ADMIN.CONFIGURATION.TAGS,
    APP_ROUTES.ADMIN.CONFIGURATION.TAGS_ALL,
  ];

  for (const route of routes) {
    test(`renders ${route}`, async ({ adminPage }) => {
      await assertRouteRenders(adminPage, route);
    });
  }

  test('presets list stays interactive', async ({ adminPage }) => {
    await assertRouteRenders(adminPage, APP_ROUTES.ADMIN.CONFIGURATION.PRESETS);
    await tryClick(adminPage, 'button');
    await expect(adminPage.locator('body')).toBeVisible();
  });

  test('element list stays interactive', async ({ adminPage }) => {
    await assertRouteRenders(
      adminPage,
      APP_ROUTES.ADMIN.CONFIGURATION.ELEMENTS_CAMERAS,
    );
    await tryClick(adminPage, 'button');
    await expect(adminPage.locator('body')).toBeVisible();
  });
});
