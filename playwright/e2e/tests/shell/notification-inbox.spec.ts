import type { Page } from '@playwright/test';
import {
  createAuthenticatedPage,
  expect,
  test,
} from '../../fixtures/auth.fixture';

// Browser UI proof uses mocked HTTP. Recipient isolation is proven separately with real Postgres.
async function mockInbox(page: Page, label: string, slug: string) {
  let readAt: string | null = null;
  let failRead = true;
  await page.route('**/v1/users/me/notification-inbox**', async (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() === 'PATCH') {
      if (failRead) {
        failRead = false;
        await route.fulfill({ status: 503, json: { message: 'Try again' } });
        return;
      }
      readAt = new Date().toISOString();
    }
    if (
      url.pathname.endsWith('unread-count') ||
      route.request().method() === 'PATCH'
    ) {
      await route.fulfill({
        json: {
          data: {
            type: 'notification-inbox-count',
            id: 'count',
            attributes: { unreadCount: readAt ? 0 : 1 },
          },
        },
      });
      return;
    }
    if (url.searchParams.has('cursor')) {
      await route.fulfill({
        json: {
          data: [
            {
              type: 'notification-inbox',
              id: 'older',
              attributes: {
                topic: 'agent.status',
                occurredAt: '2026-09-04T10:00:00Z',
                readAt: '2026-09-04T11:00:00Z',
                outcome: 'failed',
                sourceHref: `/${slug}/~/agent/older-thread`,
                sourceLabel: 'Older conversation',
                failure: null,
              },
            },
          ],
          links: { cursor: { nextCursor: null, hasMore: false } },
        },
      });
      return;
    }
    await route.fulfill({
      json: {
        data: [
          {
            type: 'notification-inbox',
            id: 'notice',
            attributes: {
              topic: 'agent.status',
              occurredAt: '2026-09-05T10:00:00Z',
              readAt,
              outcome: 'failed',
              sourceHref: null,
              sourceLabel: null,
              failure: {
                title: label,
                summary: 'The run did not finish.',
                recovery: 'Retry the message.',
              },
            },
          },
        ],
        links: {
          cursor: {
            nextCursor: '2026-09-05T10:00:00.000Z|notice',
            hasMore: true,
          },
        },
      },
    });
  });
}

for (const fixture of [
  {
    userId: 'inbox-alice',
    orgId: 'alpha-inbox',
    slug: 'alpha',
    label: 'Alice agent alert',
    viewport: { width: 1280, height: 720 },
  },
  {
    userId: 'inbox-bob',
    orgId: 'bravo-inbox',
    slug: 'bravo',
    label: 'Bob agent alert',
    viewport: { width: 390, height: 844 },
  },
]) {
  test(`inbox history and retry for ${fixture.userId}`, async ({
    browser,
  }, testInfo) => {
    const context = await browser.newContext({ viewport: fixture.viewport });
    const page = await context.newPage();
    await createAuthenticatedPage(
      page,
      context,
      {
        userId: fixture.userId,
        organizationId: fixture.orgId,
      },
      '/test-org/~/settings/notifications',
    );
    await page.route('**/v1/organizations**', async (route) => {
      if (
        route.request().method() === 'GET' &&
        new URL(route.request().url()).searchParams.get('mine') === 'true'
      ) {
        await route.fulfill({
          json: [
            {
              id: fixture.orgId,
              slug: fixture.slug,
              label: fixture.slug,
              isActive: true,
              isOwner: true,
              brand: null,
            },
          ],
        });
        return;
      }
      await route.fallback();
    });
    await mockInbox(page, fixture.label, fixture.slug);
    await page.goto(`/${fixture.slug}/~/settings/notifications`);
    const trigger = page.getByRole('button', {
      name: 'Open notifications, 1 unread',
    });
    await expect(trigger).toBeVisible();
    await trigger.focus();
    await page.keyboard.press('Enter');
    await expect(
      page.getByRole('heading', { name: fixture.label }),
    ).toBeVisible();
    await expect(page.getByText('Source unavailable')).toBeVisible();
    await page.getByRole('button', { name: 'Mark read', exact: true }).click();
    const inlineError = page
      .getByRole('alert')
      .filter({ hasText: 'Could not mark notifications read' });
    const debugDialog = page.getByRole('dialog', { name: 'Request failed' });
    await expect
      .poll(
        async () =>
          (await debugDialog.isVisible()) || (await inlineError.isVisible()),
      )
      .toBe(true);
    if (await debugDialog.isVisible()) {
      await debugDialog
        .getByRole('button', { name: 'Close', exact: true })
        .click();
      if (
        !(await page
          .getByRole('heading', { name: 'Notifications', exact: true })
          .isVisible())
      ) {
        await trigger.click();
      }
    }
    await expect(inlineError).toBeVisible();
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Open notifications, 0 unread' }),
    ).toBeVisible();
    await page.reload();
    await page
      .getByRole('button', { name: 'Open notifications, 0 unread' })
      .click();
    await expect(
      page.getByRole('heading', { name: fixture.label }),
    ).toBeVisible();
    await expect(page.getByText('Unread', { exact: true })).toHaveCount(0);
    await page
      .getByRole('button', { name: 'Load older notifications' })
      .click();
    await expect(page.getByText('Older conversation')).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath('inbox.png'),
      fullPage: false,
    });
    const selectedThreadRequest = page.waitForRequest((request) =>
      new URL(request.url()).pathname.startsWith(
        '/v1/agent/threads/older-thread',
      ),
    );
    await page.getByRole('link', { name: 'Open run' }).click();
    await selectedThreadRequest;
    await expect(page).toHaveURL(
      new URL(`/${fixture.slug}/~/agent/older-thread`, page.url()).href,
    );
    await context.close();
  });
}
