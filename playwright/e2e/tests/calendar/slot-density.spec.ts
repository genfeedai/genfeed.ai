import { CalendarSlotState, PostCategory } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { Page } from '@playwright/test';
import { playwrightApiEndpoint } from '../../config/environment';
import { mockActiveSubscription } from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { CalendarPage } from '../../pages/calendar.page';
import { assertRouteRenders } from '../../utils/route-assertions';

function jsonApiCollection(
  type: string,
  resources: Array<{ attributes: Record<string, unknown>; id: string }>,
) {
  return {
    data: resources.map((resource) => ({
      attributes: resource.attributes,
      id: resource.id,
      type,
    })),
  };
}

function jsonApiResource(
  type: string,
  id: string,
  attributes: Record<string, unknown>,
) {
  return {
    data: {
      attributes,
      id,
      type,
    },
  };
}

function missingSlot(identityKey: string, instant: string) {
  return {
    attributes: {
      brandId: 'brand-123',
      cadenceId: 'cadence-1',
      credentialId: 'credential-1',
      format: PostCategory.REEL,
      identityKey,
      instant,
      resolvedBrief: 'Ship in public',
      state: CalendarSlotState.MISSING,
      timezone: 'UTC',
    },
    id: identityKey,
  };
}

async function mockCadenceCalendar(page: Page): Promise<void> {
  const firstInstant = new Date();
  firstInstant.setHours(10, 0, 0, 0);
  const secondInstant = new Date(firstInstant);
  secondInstant.setHours(12, 0, 0, 0);

  const slots = [
    missingSlot('ghost-1', firstInstant.toISOString()),
    missingSlot('ghost-2', secondInstant.toISOString()),
  ];

  await page.route(
    `**${playwrightApiEndpoint}/post-groups**`,
    async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          body: JSON.stringify(jsonApiCollection('release-groups', [])),
          contentType: 'application/json',
        });
        return;
      }
      await route.fallback();
    },
  );
  await page.route(`**${playwrightApiEndpoint}/articles**`, async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        body: JSON.stringify(jsonApiCollection('articles', [])),
        contentType: 'application/json',
      });
      return;
    }
    await route.fallback();
  });
  await page.route(
    `**${playwrightApiEndpoint}/posting-cadences**`,
    async (route) => {
      const url = route.request().url();
      const method = route.request().method();
      if (method === 'GET' && url.includes('/slots')) {
        await route.fulfill({
          body: JSON.stringify(jsonApiCollection('calendar-slot', slots)),
          contentType: 'application/json',
        });
        return;
      }
      if (method === 'GET') {
        await route.fulfill({
          body: JSON.stringify(jsonApiCollection('posting-cadence', [])),
          contentType: 'application/json',
        });
        return;
      }
      if (method === 'POST' && url.includes('/slots/generate-bulk')) {
        await route.fulfill({
          body: JSON.stringify(
            jsonApiResource('calendar-slot-bulk-generate', 'bulk-1', {
              completed: slots.map((slot) => ({
                ...slot.attributes,
                identityKey: slot.id,
                state: CalendarSlotState.FILLED,
              })),
              completedCount: 2,
              isCancelled: false,
              isCreditsExhausted: false,
              remainingCount: 0,
              remainingIdentityKeys: [],
            }),
          ),
          contentType: 'application/json',
        });
        return;
      }
      await route.fallback();
    },
  );
}

test.describe('Calendar — slot density', () => {
  test.setTimeout(90_000);

  test.beforeEach(async ({ authenticatedPage }) => {
    await mockActiveSubscription(authenticatedPage, {
      credits: 1000,
      plan: 'pro',
    });
  });

  test('bulk generates two missing slots after confirming the count', async ({
    authenticatedPage,
  }) => {
    await mockCadenceCalendar(authenticatedPage);
    await assertRouteRenders(authenticatedPage, APP_ROUTES.PUBLISHING.CALENDAR);

    const bulk = authenticatedPage.getByRole('button', {
      name: /Generate missing \(2\)/,
    });
    await expect(bulk).toBeVisible({ timeout: 15_000 });
    await bulk.click();

    const confirm = authenticatedPage.getByRole('button', {
      name: 'Generate 2',
    });
    await expect(confirm).toBeVisible({ timeout: 10_000 });
    await confirm.click();

    await expect(authenticatedPage.getByText('Generated 2 slots.')).toBeVisible(
      { timeout: 15_000 },
    );
  });

  test('month view shows filled vs missing counts instead of every ghost', async ({
    authenticatedPage,
  }) => {
    await mockCadenceCalendar(authenticatedPage);
    const calendar = new CalendarPage(authenticatedPage);
    await assertRouteRenders(authenticatedPage, APP_ROUTES.PUBLISHING.CALENDAR);

    await expect(
      authenticatedPage.getByRole('button', { name: /Generate missing \(2\)/ }),
    ).toBeVisible({ timeout: 15_000 });

    // The month switcher is always part of the calendar header, so a failure to
    // reach month view is the finding — not something to swallow and rediscover
    // as a missing-density timeout further down.
    await calendar.switchToMonthView();

    // A day aggregate prints its density twice: once as the event title and
    // once as the muted badge. Pin the badge so the assertion stays single.
    await expect(
      authenticatedPage
        .locator('.gen-calendar-event-badge')
        .filter({ hasText: /2 missing \/ 0 filled/ })
        .first(),
    ).toBeVisible({ timeout: 15_000 });
  });
});
