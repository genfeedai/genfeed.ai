import { expect, test } from '@e2e/fixtures/auth.fixture';
import {
  buildProtectedAppBootstrapPayload,
  generateMockBrand,
} from '@e2e/utils/api-interceptor';
import type { Page } from '@playwright/test';

const API_LATENCY_MS = 200;
const NAME_CHANGE_BUDGET_MS = 150;
const FIRST_BRAND_PATH = '/test-org/brand-1/workspace';

const SECOND_BRAND = generateMockBrand({
  id: 'brand-2',
  label: 'Brand 2',
  name: 'Brand 2',
  slug: 'brand-2',
});

async function mockTwoBrands(page: Page): Promise<void> {
  const payload = buildProtectedAppBootstrapPayload();
  const brands = [payload.brands[0], SECOND_BRAND];

  await page.route(
    /\/v1\/auth\/bootstrap(?:\/overview)?(?:\?.*)?$/,
    async (route) => {
      await route.fulfill({
        body: JSON.stringify({ ...payload, brands }),
        contentType: 'application/json',
        status: 200,
      });
    },
  );
  await page.route('**/v1/users/me/brands', async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        data: brands.map((brand) => ({
          attributes: brand,
          id: brand.id,
          type: 'brand',
        })),
      }),
      contentType: 'application/vnd.api+json',
      status: 200,
    });
  });
}

/** Adds latency to every API call, as the audit did, without changing the answers. */
async function delayEveryApiCall(page: Page): Promise<void> {
  await page.route('**/v1/**', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, API_LATENCY_MS));
    await route.fallback();
  });
}

test.describe('Brand switch', () => {
  test('shows the chosen brand within 150 ms and saves the last brand once', async ({
    authenticatedPage: page,
  }) => {
    await mockTwoBrands(page);

    const saveRequests: string[] = [];
    await page.route('**/v1/users/me/brands/*', async (route) => {
      if (route.request().method() === 'PATCH') {
        saveRequests.push(new URL(route.request().url()).pathname);
        await new Promise((resolve) => setTimeout(resolve, API_LATENCY_MS));
        await route.fulfill({
          body: JSON.stringify({ data: { id: 'brand-2', type: 'brand' } }),
          contentType: 'application/vnd.api+json',
          status: 200,
        });
        return;
      }
      await route.fallback();
    });

    await page.goto(FIRST_BRAND_PATH, { waitUntil: 'domcontentloaded' });
    const trigger = page.getByTestId('brand-switcher-trigger').first();
    await expect(trigger).toContainText('Brand 1', { timeout: 20_000 });

    await trigger.click();
    const option = page.getByRole('option', { name: /Brand 2/ });
    await expect(option).toBeVisible();

    // Measure inside the page: the clock starts at the click event and stops
    // when the trigger text changes, so test-runner overhead is not counted.
    await page.evaluate(() => {
      const target = document.querySelector(
        '[data-testid="brand-switcher-trigger"]',
      );
      const state = window as unknown as {
        __brandSwitchTiming: { clickedAt?: number; changedAt?: number };
      };
      state.__brandSwitchTiming = {};
      document.addEventListener(
        'click',
        () => {
          state.__brandSwitchTiming.clickedAt = performance.now();
        },
        { capture: true, once: true },
      );
      new MutationObserver((_, observer) => {
        if (target?.textContent?.includes('Brand 2')) {
          state.__brandSwitchTiming.changedAt = performance.now();
          observer.disconnect();
        }
      }).observe(target ?? document.body, {
        characterData: true,
        childList: true,
        subtree: true,
      });
    });

    await delayEveryApiCall(page);
    await option.click();

    await expect(trigger).toContainText('Brand 2');
    const timing = await page.evaluate(
      () =>
        (
          window as unknown as {
            __brandSwitchTiming: { clickedAt?: number; changedAt?: number };
          }
        ).__brandSwitchTiming,
    );
    expect(timing.clickedAt).toBeDefined();
    expect(timing.changedAt).toBeDefined();
    expect((timing.changedAt ?? 0) - (timing.clickedAt ?? 0)).toBeLessThan(
      NAME_CHANGE_BUDGET_MS,
    );

    await expect(page).toHaveURL(/\/test-org\/brand-2\//);
    await page.waitForTimeout(API_LATENCY_MS * 3);
    expect(saveRequests).toEqual(['/v1/users/me/brands/brand-2']);
  });
});
