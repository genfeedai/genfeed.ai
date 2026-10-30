import {
  mockActiveSubscription,
  mockLibraryData,
} from '@e2e/fixtures/api-mocks.fixture';
import { expect, test } from '@e2e/fixtures/auth.fixture';
import {
  APP_ROUTES,
  createBrandAppRoute,
} from '@genfeedai/contracts/constants';
import type { Page } from '@playwright/test';

const SERVER_LATENCY_MS = 800;
const PREFETCH_SETTLE_MS = 4000;
const INSTANT_BUDGET_MS = 400;

async function delayServerRenders(page: Page): Promise<void> {
  await page.route(
    (url) =>
      url.searchParams.has('_rsc') || url.pathname.startsWith('/_next/data'),
    async (route) => {
      await new Promise((resolve) => setTimeout(resolve, SERVER_LATENCY_MS));
      await route.fallback();
    },
  );
}

// A click on a rail destination must paint the destination without waiting for
// a server render: the link is prefetched on viewport entry and the visited
// route stays cached (#6227). The server render is delayed to make a missed
// prefetch visible as click-to-paint time.
test('rail navigation paints without waiting for a server render', async ({
  authenticatedPage: page,
}, testInfo) => {
  const placeholderRequests: string[] = [];
  page.on('request', (request) => {
    if (/%%drp:|%25%25drp/i.test(request.url())) {
      placeholderRequests.push(request.url());
    }
  });
  await mockActiveSubscription(page, { credits: 1000, plan: 'pro' });
  await mockLibraryData(page);
  await page.goto(
    createBrandAppRoute('test-org', 'brand-1', APP_ROUTES.LIBRARY.ASSETS),
  );
  await expect(
    page.getByRole('heading', { name: 'All assets', exact: true }),
  ).toBeVisible();

  await delayServerRenders(page);
  await page.waitForTimeout(PREFETCH_SETTLE_MS);

  const target = page.getByTestId('app-rail-item-analytics');
  await expect(target).toBeVisible();
  const href = await target.getAttribute('href');
  expect(href).not.toContain('%%drp:');

  const startedAt = Date.now();
  await target.click();
  await page.waitForURL((url) => url.pathname === href);
  await expect(page.locator('main').first()).toBeVisible();
  await expect(page.getByTestId('app-rail')).toBeVisible();
  const elapsedMs = Date.now() - startedAt;

  testInfo.annotations.push({
    description: `${elapsedMs}ms (server render delayed ${SERVER_LATENCY_MS}ms)`,
    type: 'click-to-destination',
  });
  expect(elapsedMs).toBeLessThan(INSTANT_BUDGET_MS);
  expect(placeholderRequests).toEqual([]);
});

// Cached routes stay mounted while hidden, so shell overlays opened on one
// route must not survive navigating away and back.
test('an open shell popover closes on route change and stays closed on return', async ({
  authenticatedPage: page,
}) => {
  await mockActiveSubscription(page, { credits: 1000, plan: 'pro' });
  await mockLibraryData(page);
  const origin = createBrandAppRoute(
    'test-org',
    'brand-1',
    APP_ROUTES.LIBRARY.ASSETS,
  );
  await page.goto(origin);

  const trigger = page.getByTestId('brand-switcher-trigger').first();
  await expect(trigger).toBeVisible();
  await trigger.click();
  const menu = page.getByRole('listbox');
  await expect(menu.first()).toBeVisible();

  const analytics = page.getByTestId('app-rail-item-analytics');
  const href = await analytics.getAttribute('href');
  await analytics.click();
  await page.waitForURL((url) => url.pathname === href);
  await expect(page.getByRole('listbox')).toHaveCount(0);

  await page.goBack();
  await page.waitForURL((url) => url.pathname === origin);
  await expect(
    page.getByRole('heading', { name: 'All assets', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
