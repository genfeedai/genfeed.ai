import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { mockWorkflowCrud } from '../../fixtures/api-mocks.fixture';
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
    APP_ROUTES.ADMIN.AUTOMATION.BOTS,
    `${APP_ROUTES.ADMIN.AUTOMATION.MODELS}/image`,
    APP_ROUTES.ADMIN.AUTOMATION.TRAININGS,
    `${APP_ROUTES.ADMIN.AUTOMATION.TRAININGS}/mock-id`,
    `${APP_ROUTES.ADMIN.AUTOMATION.TRAININGS}/mock-id/sources`,
    APP_ROUTES.ADMIN.AUTOMATION.WORKFLOWS,
  ];

  for (const route of routes) {
    test(`renders ${route}`, async ({ adminPage }) => {
      await assertRouteRenders(adminPage, route);
    });
  }

  test('bots list is the shared table with the shared empty state', async ({
    adminPage,
  }) => {
    await assertRouteRenders(adminPage, APP_ROUTES.ADMIN.AUTOMATION.BOTS);
    await expect(adminPage.getByText('No bots found')).toBeVisible();
    await expect(adminPage.getByText('No bots yet')).toHaveCount(0);
    await tryClick(adminPage, 'button');
    await expect(adminPage.locator('body')).toBeVisible();
  });

  test('workflows list stays interactive', async ({ adminPage }) => {
    await assertRouteRenders(adminPage, APP_ROUTES.ADMIN.AUTOMATION.WORKFLOWS);
    await tryClick(adminPage, 'button');
    await expect(adminPage.locator('body')).toBeVisible();
  });

  test('workflows are one table, filtered by type', async ({ adminPage }) => {
    await mockWorkflowCrud(adminPage, [
      {
        createdAt: '2026-09-01T00:00:00.000Z',
        description: '',
        edges: [],
        id: 'wf-e2e-launch',
        name: 'E2E launch thread',
        nodes: [],
        status: 'active',
        updatedAt: '2026-09-01T00:00:00.000Z',
      },
    ]);

    await adminPage.goto(
      `${APP_ROUTES.ADMIN.AUTOMATION.WORKFLOWS}?type=organization`,
    );
    const table = adminPage.getByRole('table', { name: 'Workflows' });
    await expect(table.getByText('E2E launch thread')).toBeVisible();
    await expect(table.getByText('Organization')).toBeVisible();
    await expect(
      adminPage.getByText('Workflows in this organization'),
    ).toHaveCount(0);

    await adminPage.goto(
      `${APP_ROUTES.ADMIN.AUTOMATION.WORKFLOWS}?type=system`,
    );
    await expect(adminPage.getByText('No workflows found')).toBeVisible();
    await expect(adminPage.getByText('E2E launch thread')).toHaveCount(0);
  });
});
