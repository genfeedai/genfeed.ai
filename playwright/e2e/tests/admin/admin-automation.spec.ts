import { expect, test } from '../../fixtures/auth.fixture';
import { assertRouteRenders, tryClick } from '../../utils/route-assertions';

/**
 * E2E route-render coverage for the Admin Automation section.
 *
 * Uses the adminPage fixture (admin routes are not tenant-scoped). All API and
 * Better Auth calls are mocked; unknown API routes auto-return empty collections so
 * each page renders without bespoke mocks.
 */
test.describe('Admin Automation', () => {
  test.setTimeout(90_000);

  const routes = [
    '/admin/automation/bots',
    '/admin/automation/models/image',
    '/admin/automation/trainings',
    '/admin/automation/trainings/mock-id/images',
    '/admin/automation/trainings/mock-id/sources',
    '/admin/automation/workflows',
  ];

  for (const route of routes) {
    test(`renders ${route}`, async ({ adminPage }) => {
      await assertRouteRenders(adminPage, route);
    });
  }

  test('bots list stays interactive', async ({ adminPage }) => {
    await assertRouteRenders(adminPage, '/admin/automation/bots');
    await tryClick(adminPage, '[data-testid="automation-bots-surface"]');
    await tryClick(adminPage, 'button');
    await expect(adminPage.locator('body')).toBeVisible();
  });

  test('workflows list stays interactive', async ({ adminPage }) => {
    await assertRouteRenders(adminPage, '/admin/automation/workflows');
    await tryClick(adminPage, 'button');
    await expect(adminPage.locator('body')).toBeVisible();
  });
});
