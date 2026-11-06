import { APP_ROUTES } from '@genfeedai/contracts/constants';
import {
  mockAdminBotsScope,
  mockWorkflowCrud,
} from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { chooseFilterOption } from '../../utils/filter-menu';
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

  // #9454: the URL-to-request mapping has a unit test; this walks the Filters
  // menu itself and observes the bot list request it sends.
  test('Filters scopes the bot list to the picked organization, then brand', async ({
    adminPage,
  }) => {
    const botListReads = await mockAdminBotsScope(adminPage);
    await assertRouteRenders(adminPage, APP_ROUTES.ADMIN.AUTOMATION.BOTS);
    const main = adminPage.getByRole('main');
    const table = main.getByRole('table');
    await expect(table.getByText('Bot of the operator')).toBeVisible();

    await chooseFilterOption(adminPage, 'Organization', /Beta Media$/, main);

    await expect(adminPage).toHaveURL(/[?&]organization=org-e2e-beta(&|$)/);
    await expect(table.getByText('Bot of org-e2e-beta')).toBeVisible();
    expect(botListReads).toContainEqual({
      brandId: null,
      organizationId: 'org-e2e-beta',
    });

    await chooseFilterOption(adminPage, 'Brand', /Beta Outdoors$/, main);

    await expect(adminPage).toHaveURL(/[?&]brand=brand-e2e-beta-2(&|$)/);
    await expect(table.getByText('Bot of brand-e2e-beta-2')).toBeVisible();
    await expect(table.getByText('Bot of org-e2e-beta')).toHaveCount(0);
    expect(botListReads.at(-1)).toEqual({
      brandId: 'brand-e2e-beta-2',
      organizationId: 'org-e2e-beta',
    });
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
