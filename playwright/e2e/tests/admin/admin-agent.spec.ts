import { APP_ROUTES } from '@genfeedai/constants';
import { expect, test } from '../../fixtures/auth.fixture';
import { assertRouteRenders, tryClick } from '../../utils/route-assertions';

/**
 * E2E route + interaction coverage for the Admin Agent section.
 *
 * Uses the adminPage fixture (admin role). The `/admin/agent/agent-1` path
 * exercises the `[threadId]` dynamic route. Auth, Better Auth, and all API calls are
 * mocked; unknown local API routes auto-return empty collections so pages
 * render without per-route mocks. Interactions are best-effort via tryClick.
 */
test.describe('Admin Agent', () => {
  test.setTimeout(60_000);

  const routes = [
    APP_ROUTES.ADMIN.AGENT,
    APP_ROUTES.ADMIN.AGENT_NEW,
    `${APP_ROUTES.ADMIN.AGENT}/agent-1`,
  ];

  for (const route of routes) {
    test(`renders ${route}`, async ({ adminPage }) => {
      await assertRouteRenders(adminPage, route);
    });
  }

  test('agent index stays interactive', async ({ adminPage }) => {
    await assertRouteRenders(adminPage, APP_ROUTES.ADMIN.AGENT);
    await tryClick(adminPage, 'button');
    await expect(adminPage.locator('body')).toBeVisible();
  });

  test('new agent thread stays interactive', async ({ adminPage }) => {
    await assertRouteRenders(adminPage, APP_ROUTES.ADMIN.AGENT_NEW);
    await tryClick(adminPage, 'textarea');
    await tryClick(adminPage, 'button');
    await expect(adminPage.locator('body')).toBeVisible();
  });
});
