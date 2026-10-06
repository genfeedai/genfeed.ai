import {
  mockActiveSubscription,
  mockLibraryData,
} from '@e2e/fixtures/api-mocks.fixture';
import { expect, test } from '@e2e/fixtures/auth.fixture';
import {
  buildProtectedAppBootstrapPayload,
  generateMockBrand,
} from '@e2e/utils/api-interceptor';
import {
  APP_ROUTES,
  createBrandAppRoute,
} from '@genfeedai/contracts/constants';
import type { Page } from '@playwright/test';

function trackPlaceholderRequests(page: Page): string[] {
  const requests: string[] = [];
  page.on('request', (request) => {
    if (/%%drp:|%25%25drp/i.test(request.url())) {
      requests.push(request.url());
    }
  });
  return requests;
}

async function expectResolvedLinks(page: Page) {
  await expect(
    page.locator('a[href*="%%drp:"], a[href*="%25%25drp"]'),
  ).toHaveCount(0);
}

// Library type and place URLs redirect to the asset list with query presets.
// Guard concrete URLs and requests while hosted prerendering is withdrawn.
test('library list navigation preserves resolved tenant parameters', async ({
  authenticatedPage,
}) => {
  const placeholderRequests = trackPlaceholderRequests(authenticatedPage);
  await mockActiveSubscription(authenticatedPage, {
    credits: 1000,
    plan: 'pro',
  });
  await mockLibraryData(authenticatedPage);
  await authenticatedPage.goto(
    createBrandAppRoute('test-org', 'brand-1', APP_ROUTES.LIBRARY.IMAGES),
  );
  const destination = createBrandAppRoute(
    'test-org',
    'brand-1',
    APP_ROUTES.LIBRARY.ASSETS,
  );
  const link = authenticatedPage.getByRole('link', {
    name: 'Recent',
    exact: true,
  });
  await expect(link).toBeVisible();
  await expectResolvedLinks(authenticatedPage);
  await test.step('navigate to the recent list', async () => {
    await link.click();
    // Place presets preserve the Images type preset's category filters.
    await authenticatedPage.waitForURL(
      (url) =>
        url.pathname === destination &&
        url.searchParams.get('place') === 'recent' &&
        url.searchParams.getAll('categories').join(',') === 'IMAGE,IMAGE_EDIT',
    );
    const url = new URL(authenticatedPage.url());
    expect(url.pathname).toBe(destination);
    expect(url.searchParams.get('place')).toBe('recent');
    expect(url.searchParams.getAll('categories')).toEqual([
      'IMAGE',
      'IMAGE_EDIT',
    ]);
    await expect(
      authenticatedPage.getByRole('heading', { name: 'Recent', exact: true }),
    ).toBeVisible();
  });
  await expectResolvedLinks(authenticatedPage);
  expect(placeholderRequests).toEqual([]);
});

test('list to detail navigation preserves resolved record parameters', async ({
  adminPage,
}) => {
  const placeholderRequests = trackPlaceholderRequests(adminPage);
  await adminPage.route(
    (url) => url.pathname === '/v1/analytics/brands',
    async (route) => {
      await route.fulfill({
        json: {
          data: {
            id: 'mock-brand-stats',
            type: 'analytics-brand-stats',
            attributes: {
              data: [
                {
                  id: 'brand-1',
                  name: 'Brand 1',
                  organizationName: 'Test Organization',
                  activePlatforms: [],
                  totalPosts: 0,
                  totalViews: 0,
                  totalEngagement: 0,
                  avgEngagementRate: 0,
                  growth: 0,
                },
              ],
              pagination: { limit: 64, page: 1, total: 1, totalPages: 1 },
            },
          },
        },
      });
    },
  );
  await adminPage.goto(APP_ROUTES.ADMIN.OVERVIEW.ANALYTICS_BRANDS);
  const destination = `${APP_ROUTES.ADMIN.OVERVIEW.ANALYTICS_BRANDS}/brand-1`;
  const link = adminPage.getByRole('link', {
    name: 'Open Brand 1 analytics',
    exact: true,
  });
  await expect(link).toBeVisible();
  await expectResolvedLinks(adminPage);
  await test.step('navigate to the brand analytics detail', async () => {
    await link.click();
    await adminPage.waitForURL((url) => url.pathname === destination);
    await expect(
      adminPage.getByRole('heading', { name: /^(Brand|Brand 1) Analytics$/ }),
    ).toBeVisible();
  });
  await expectResolvedLinks(adminPage);
  expect(placeholderRequests).toEqual([]);
});

test('brand switch navigation preserves the destination brand parameters', async ({
  authenticatedPage,
}) => {
  const placeholderRequests = trackPlaceholderRequests(authenticatedPage);
  await mockActiveSubscription(authenticatedPage, {
    credits: 1000,
    plan: 'pro',
  });
  await mockLibraryData(authenticatedPage);
  const bootstrap = buildProtectedAppBootstrapPayload();
  bootstrap.brands.push(
    generateMockBrand({
      id: 'brand-2',
      label: 'Brand 2',
      name: 'Brand 2',
      slug: 'brand-2',
    }),
  );
  const brands = bootstrap.brands.map((brand) => ({
    attributes: brand,
    id: brand.id,
    type: 'brands',
  }));
  await authenticatedPage.route(
    (url) =>
      url.pathname.endsWith('/auth/bootstrap') ||
      url.pathname.endsWith('/users/me/brands') ||
      /\/brands\/(?:brand-[12]|slug)$/.test(url.pathname),
    async (route) => {
      if (route.request().method() !== 'GET') {
        await route.fallback();
        return;
      }
      const url = new URL(route.request().url());
      if (url.pathname.endsWith('/auth/bootstrap')) {
        await route.fulfill({ json: bootstrap });
      } else if (url.pathname.endsWith('/users/me/brands')) {
        await route.fulfill({ json: { data: brands } });
      } else {
        const isSecondBrand =
          url.pathname.endsWith('/brand-2') ||
          url.searchParams.get('slug') === 'brand-2';
        await route.fulfill({ json: { data: brands[isSecondBrand ? 1 : 0] } });
      }
    },
  );
  await authenticatedPage.goto(
    createBrandAppRoute('test-org', 'brand-1', APP_ROUTES.LIBRARY.ASSETS),
  );
  const destination = createBrandAppRoute(
    'test-org',
    'brand-2',
    APP_ROUTES.LIBRARY.ASSETS,
  );
  const trigger = authenticatedPage
    .getByTestId('brand-switcher-trigger')
    .first();
  await expect(trigger).toBeVisible();
  await trigger.click();
  const choice = authenticatedPage.getByRole('option', {
    name: /\bBrand 2$/,
  });
  await expect(choice).toBeVisible();
  await expectResolvedLinks(authenticatedPage);
  await test.step('navigate to the selected brand', async () => {
    await choice.click();
    await authenticatedPage.waitForURL(
      (url) => `${url.pathname}${url.search}` === destination,
    );
    await expect(trigger).toHaveText(/Brand 2/);
    await expect(
      authenticatedPage.getByRole('heading', {
        name: 'All assets',
        exact: true,
      }),
    ).toBeVisible();
  });
  await expectResolvedLinks(authenticatedPage);
  expect(placeholderRequests).toEqual([]);
});
