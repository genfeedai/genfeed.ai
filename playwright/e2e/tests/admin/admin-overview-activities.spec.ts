import { ActivityKey } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { Route } from '@playwright/test';
import { expect, test } from '../../fixtures/auth.fixture';
import { assertRouteRenders, tryClick } from '../../utils/route-assertions';

/**
 * E2E route + interaction coverage for the Admin Overview Activities page.
 *
 * Uses the adminPage fixture (admin role). Auth, Better Auth, and all API calls are
 * mocked; unknown local API routes auto-return empty collections so the page
 * renders without per-route mocks. Interactions are best-effort via tryClick.
 */
test.describe('Admin Overview Activities', () => {
  test.setTimeout(60_000);

  const routes = [APP_ROUTES.ADMIN.OVERVIEW.ACTIVITIES];

  for (const route of routes) {
    test(`renders ${route}`, async ({ adminPage }) => {
      await assertRouteRenders(adminPage, route);
    });
  }

  test('activities view stays interactive', async ({ adminPage }) => {
    await assertRouteRenders(adminPage, APP_ROUTES.ADMIN.OVERVIEW.ACTIVITIES);
    await tryClick(adminPage, '[role="tab"]');
    await tryClick(adminPage, 'button');
    await expect(adminPage.locator('body')).toBeVisible();
  });

  test('keeps the Context toggle after the panel closes and marks unread rows from their dot', async ({
    adminPage,
  }) => {
    await adminPage.setViewportSize({ height: 900, width: 1440 });
    const fulfill = async (route: Route): Promise<void> => {
      if (route.request().method() !== 'GET') {
        await route.continue();
        return;
      }
      await route.fulfill({
        body: JSON.stringify({
          data: [
            {
              attributes: {
                createdAt: '2026-11-02T06:08:26.000Z',
                isRead: false,
                key: ActivityKey.VIDEO_GENERATED,
                source: 'video-generate',
                value: '',
              },
              id: 'activity-unread',
              type: 'activities',
            },
            {
              attributes: {
                createdAt: '2026-11-02T05:08:26.000Z',
                isRead: true,
                key: ActivityKey.IMAGE_GENERATED,
                source: 'image-generate',
                value: '',
              },
              id: 'activity-read',
              type: 'activities',
            },
          ],
          meta: { page: 1, pageSize: 20, totalCount: 2 },
        }),
        contentType: 'application/json',
        status: 200,
      });
    };
    await adminPage.route('**/api.genfeed.ai/v1/activities**', fulfill);
    await adminPage.route('**/v1/activities**', fulfill);

    await adminPage.goto(APP_ROUTES.ADMIN.OVERVIEW.ACTIVITIES, {
      waitUntil: 'domcontentloaded',
    });
    await adminPage.getByText('Generated a video').click();

    const toggle = adminPage.getByTestId('topbar-context-toggle');
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');

    await toggle.click();
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');

    // Only the unread row carries the mark-as-read dot.
    await expect(
      adminPage
        .getByRole('table')
        .getByRole('button', { name: 'Mark as read' }),
    ).toHaveCount(1);
  });

  test('opens one header with read state, status first, and the finished video', async ({
    adminPage,
  }) => {
    await adminPage.setViewportSize({ height: 900, width: 1440 });
    const fulfill = async (route: Route): Promise<void> => {
      if (route.request().method() !== 'GET') {
        await route.continue();
        return;
      }
      await route.fulfill({
        body: JSON.stringify({
          data: [
            {
              attributes: {
                createdAt: '2026-11-02T06:08:26.000Z',
                entityId: 'video-1',
                entityModel: 'Ingredient',
                isRead: false,
                key: ActivityKey.VIDEO_GENERATED,
                organizationId: 'org-123',
                source: 'video-generate',
                value: JSON.stringify({
                  ingredientId: 'video-1',
                  type: 'generation',
                }),
              },
              id: 'activity-video',
              type: 'activities',
            },
          ],
          meta: { page: 1, pageSize: 20, totalCount: 1 },
        }),
        contentType: 'application/json',
        status: 200,
      });
    };
    await adminPage.route('**/api.genfeed.ai/v1/activities**', fulfill);
    await adminPage.route('**/v1/activities**', fulfill);

    await adminPage.goto(APP_ROUTES.ADMIN.OVERVIEW.ACTIVITIES, {
      waitUntil: 'domcontentloaded',
    });
    await adminPage.getByText('Generated a video').click();

    const panel = adminPage.getByTestId('activity-detail-panel');
    await expect(panel).toBeVisible();

    // Read state lives in the shell rail beside close, not in a second row.
    const toggle = adminPage
      .getByTestId('context-sidebar-header-actions')
      .getByTestId('activity-toggle-read');
    await expect(toggle).toHaveAccessibleName('Mark as read');
    await expect(panel.getByTestId('activity-toggle-read')).toHaveCount(0);

    // Status leads the details list.
    await expect(panel.locator('dt').first()).toHaveText('Status');

    // A finished video plays in the sidebar.
    await expect(panel.locator('video')).toHaveCount(1);
  });

  test('reads time first, grouped by day, with the organization and plain audit labels', async ({
    adminPage,
  }) => {
    await adminPage.setViewportSize({ height: 900, width: 1440 });
    const fulfill = async (route: Route): Promise<void> => {
      if (route.request().method() !== 'GET') {
        await route.continue();
        return;
      }
      await route.fulfill({
        body: JSON.stringify({
          data: [
            {
              attributes: {
                createdAt: '2026-11-02T06:08:26.000Z',
                isRead: true,
                key: ActivityKey.POST_LIFECYCLE_TRANSITION,
                organizationLabel: 'Acme Studio',
                source: 'system',
                value: JSON.stringify({ from: 'scheduled', to: 'publishing' }),
              },
              id: 'activity-transition',
              type: 'activities',
            },
            {
              attributes: {
                createdAt: '2026-11-01T22:00:00.000Z',
                isRead: true,
                key: ActivityKey.BRAND_OS_EXPORT_REVOKE,
                organizationLabel: 'Globex',
                source: 'system',
                value: '',
              },
              id: 'activity-export',
              type: 'activities',
            },
          ],
          meta: { page: 1, pageSize: 20, totalCount: 2 },
        }),
        contentType: 'application/json',
        status: 200,
      });
    };
    await adminPage.route('**/api.genfeed.ai/v1/activities**', fulfill);
    await adminPage.route('**/v1/activities**', fulfill);

    await adminPage.goto(APP_ROUTES.ADMIN.OVERVIEW.ACTIVITIES, {
      waitUntil: 'domcontentloaded',
    });

    const table = adminPage.getByRole('table');
    const headers = table.getByRole('columnheader');
    await expect(headers.filter({ hasText: 'When' })).toHaveCount(1);
    await expect(headers.filter({ hasText: 'Organization' })).toHaveCount(1);
    // No column sorts, so no header carries a button or sort arrow.
    await expect(headers.getByRole('button')).toHaveCount(0);

    await expect(table.getByText('06:08:26')).toBeVisible();
    await expect(table.getByText(/· UTC$/)).toHaveCount(2);

    await expect(table.getByText('Acme Studio')).toBeVisible();
    await expect(table.getByText('Globex')).toBeVisible();
    await expect(
      table.getByText('Post moved from Scheduled to Publishing'),
    ).toBeVisible();
    await expect(table.getByText('Brand OS export revoked')).toBeVisible();
  });
});
