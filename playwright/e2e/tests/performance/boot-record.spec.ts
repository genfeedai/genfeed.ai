import type { Page } from '@playwright/test';
import { createPlaywrightApiRoutePattern } from '../../config/environment';
import {
  mockActiveSubscription,
  mockAnalyticsData,
} from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { DashboardPage } from '../../pages/dashboard.page';
import {
  BLOCK_SHIFT_BUDGET_PX,
  holdRequests,
} from '../../utils/block-skeleton-helpers';

const BOOT_RECORD_KEY = 'genfeed:boot:v2';
const MEMBERSHIP = createPlaywrightApiRoutePattern('organizations');

const isApiRead = (url: URL): boolean => url.pathname.startsWith('/v1/');

async function storedBootRecord(page: Page): Promise<string | null> {
  return await page.evaluate(
    (key) => window.localStorage.getItem(key),
    BOOT_RECORD_KEY,
  );
}

/**
 * A reload drew a placeholder rail until three calls in a row (session, token,
 * membership) had answered (epic #10926, #10931). The rail the server last
 * confirmed is kept on the device, so the real navigation is drawn at once and
 * the checks run behind it.
 */
test.describe('Workspace frame — boot record', () => {
  test.setTimeout(90_000);

  test('draws the real rail before any API request has answered', async ({
    authenticatedPage: page,
  }) => {
    await mockActiveSubscription(page, { credits: 1000, plan: 'pro' });
    await mockAnalyticsData(page);
    const dashboardPage = new DashboardPage(page);

    await dashboardPage.goto();
    await expect(page.getByTestId('app-content-shell')).toBeVisible();
    await expect.poll(() => storedBootRecord(page)).not.toBeNull();

    const held = await holdRequests(page, isApiRead);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await held.whenHeld;

    const frameRail = page
      .getByTestId('workspace-frame-skeleton-rail')
      .getByTestId('app-rail');
    await expect(frameRail).toBeVisible();
    await expect(
      frameRail.locator('[data-app-rail-app]').first(),
    ).toBeVisible();
    await expect(page.getByTestId('app-content-shell')).toHaveCount(0);
    const drawn = await frameRail
      .locator('[data-app-rail-app]')
      .first()
      .boundingBox();

    held.release();
    await expect(page.getByTestId('app-content-shell')).toBeVisible();
    const live = await page
      .getByTestId('app-rail')
      .locator('[data-app-rail-app]')
      .first()
      .boundingBox();

    // The live rail takes the stored one's place: the first app does not move.
    expect(drawn).not.toBeNull();
    expect(live).not.toBeNull();
    expect(Math.abs((live?.x ?? 0) - (drawn?.x ?? 0))).toBeLessThanOrEqual(
      BLOCK_SHIFT_BUDGET_PX,
    );
    expect(Math.abs((live?.y ?? 0) - (drawn?.y ?? 0))).toBeLessThanOrEqual(
      BLOCK_SHIFT_BUDGET_PX,
    );
  });

  test('wipes the record and fetches nothing for the organization once the membership is gone', async ({
    authenticatedPage: page,
  }) => {
    await mockActiveSubscription(page, { credits: 1000, plan: 'pro' });
    await mockAnalyticsData(page);
    const dashboardPage = new DashboardPage(page);

    await dashboardPage.goto();
    await expect(page.getByTestId('app-content-shell')).toBeVisible();
    await expect.poll(() => storedBootRecord(page)).not.toBeNull();

    // The member was removed since the last load: the list no longer has it.
    await page.route(MEMBERSHIP, async (route) => {
      if (route.request().url().includes('mine=true')) {
        await route.fulfill({
          body: JSON.stringify([]),
          contentType: 'application/json',
          status: 200,
        });
        return;
      }
      await route.fallback();
    });
    const scopedRequests: string[] = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (
        isApiRead(url) &&
        (url.pathname.includes('/organizations/mock-org-id-e2e-test') ||
          url.searchParams.has('organizationId'))
      ) {
        scopedRequests.push(`${request.method()} ${url.pathname}`);
      }
    });

    await page.reload({ waitUntil: 'domcontentloaded' });

    await expect(page.getByTestId('app-content-shell')).toHaveCount(0);
    await expect(page.getByTestId('workspace-frame-skeleton-rail')).toHaveCount(
      0,
    );
    await expect.poll(() => storedBootRecord(page)).toBeNull();
    expect(scopedRequests).toEqual([]);
  });

  test("never draws another user's rail", async ({
    authenticatedPage: page,
  }) => {
    const dashboardPage = new DashboardPage(page);
    await mockActiveSubscription(page, { credits: 1000, plan: 'pro' });
    await mockAnalyticsData(page);
    await dashboardPage.goto();
    await expect(page.getByTestId('app-content-shell')).toBeVisible();
    await expect.poll(() => storedBootRecord(page)).not.toBeNull();

    // Another member signed in on this device since: the stored rail is theirs.
    await page.evaluate((key) => {
      const record = JSON.parse(window.localStorage.getItem(key) ?? '{}');
      window.localStorage.setItem(
        key,
        JSON.stringify({ ...record, userId: 'someone-else' }),
      );
    }, BOOT_RECORD_KEY);

    const held = await holdRequests(page, isApiRead);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await held.whenHeld;

    await expect(page.getByTestId('workspace-frame-skeleton')).toBeVisible();
    await expect(
      page.getByTestId('workspace-frame-skeleton-rail').getByTestId('app-rail'),
    ).toHaveCount(0);
    await expect.poll(() => storedBootRecord(page)).toBeNull();
    held.release();
  });

  test('never draws a rail written under another session', async ({
    authenticatedPage: page,
  }) => {
    const dashboardPage = new DashboardPage(page);
    await mockActiveSubscription(page, { credits: 1000, plan: 'pro' });
    await mockAnalyticsData(page);
    await dashboardPage.goto();
    await expect(page.getByTestId('app-content-shell')).toBeVisible();
    await expect.poll(() => storedBootRecord(page)).not.toBeNull();
    const sessionTag = await page.evaluate(
      () => document.cookie.match(/genfeed_session_tag=([0-9a-f]+)/)?.[1],
    );
    expect(sessionTag).toMatch(/^[0-9a-f]{16}$/);

    // The same user, but the session cookie changed without this app's code
    // running (a shared cookie domain, another sign-in): the tag differs.
    await page.evaluate((key) => {
      const record = JSON.parse(window.localStorage.getItem(key) ?? '{}');
      window.localStorage.setItem(
        key,
        JSON.stringify({ ...record, sessionTag: 'another-session' }),
      );
    }, BOOT_RECORD_KEY);

    const held = await holdRequests(page, isApiRead);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await held.whenHeld;

    await expect(page.getByTestId('workspace-frame-skeleton')).toBeVisible();
    await expect(
      page.getByTestId('workspace-frame-skeleton-rail').getByTestId('app-rail'),
    ).toHaveCount(0);
    held.release();

    // The confirmed workspace writes the record again, under this session.
    await expect(page.getByTestId('app-content-shell')).toBeVisible();
    await expect
      .poll(
        async () =>
          JSON.parse((await storedBootRecord(page)) ?? '{}').sessionTag,
      )
      .toBe(sessionTag);
  });
});
