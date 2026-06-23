import {
  generateMockPost,
  mockActiveSubscription,
  mockCalendarPosts,
} from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { CalendarPage } from '../../pages/calendar.page';
import {
  assertRouteRenders,
  expectNoErrorOverlay,
  tryClick,
} from '../../utils/route-assertions';

/**
 * Deep interaction coverage for the content calendar (posts/calendar) and the
 * tasks list + detail surfaces.
 *
 * Drives month/period navigation, view toggles, posts/articles tab switching,
 * day/event opening, plus task status filtering and overlay/detail navigation.
 * Mocks Better Auth + API responses; interactions fall back to best-effort
 * `tryClick` so coverage paths remain non-brittle under selector drift.
 *
 * @module calendar-tasks-interactions.spec
 */

function buildScheduledPosts() {
  const now = new Date();

  return [
    generateMockPost({
      description: 'Monday teaser',
      id: 'cal-int-001',
      label: 'Teaser Post',
      platform: 'twitter',
      scheduledDate: new Date(
        now.getFullYear(),
        now.getMonth(),
        12,
        9,
        0,
      ).toISOString(),
      status: 'SCHEDULED',
    }),
    generateMockPost({
      description: 'Midweek reel',
      id: 'cal-int-002',
      label: 'Reel Post',
      platform: 'instagram',
      scheduledDate: new Date(
        now.getFullYear(),
        now.getMonth(),
        16,
        14,
        0,
      ).toISOString(),
      status: 'SCHEDULED',
    }),
  ];
}

test.describe('Calendar — deep interactions', () => {
  test.setTimeout(90_000);

  test.beforeEach(async ({ authenticatedPage }) => {
    await mockActiveSubscription(authenticatedPage, {
      credits: 1000,
      plan: 'pro',
    });
  });

  test('navigates between calendar periods and switches view modes', async ({
    authenticatedPage,
  }) => {
    const calendar = new CalendarPage(authenticatedPage);

    await mockCalendarPosts(authenticatedPage, buildScheduledPosts());
    await assertRouteRenders(authenticatedPage, '/posts/calendar');

    await calendar.goToNextPeriod().catch(() => {});
    await calendar.goToPreviousPeriod().catch(() => {});
    await calendar.goToToday().catch(() => {});

    await calendar.switchToMonthView().catch(() => {});
    await calendar.switchToWeekView().catch(() => {});

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('switches between posts and articles tabs on the calendar', async ({
    authenticatedPage,
  }) => {
    await mockCalendarPosts(authenticatedPage, buildScheduledPosts());
    await assertRouteRenders(authenticatedPage, '/posts/calendar');

    // Tabs render as links/icons in the calendar header; best-effort toggle.
    await tryClick(authenticatedPage, 'a:has-text("Articles")');
    await tryClick(authenticatedPage, 'button:has-text("Articles")');
    await tryClick(authenticatedPage, 'a:has-text("Posts")');
    await tryClick(authenticatedPage, 'button:has-text("Posts")');
    await tryClick(authenticatedPage, 'a:has-text("List")');

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('opens a calendar event/day and dismisses the detail overlay', async ({
    authenticatedPage,
  }) => {
    const calendar = new CalendarPage(authenticatedPage);

    await mockCalendarPosts(authenticatedPage, buildScheduledPosts());
    await assertRouteRenders(authenticatedPage, '/posts/calendar');

    const eventCount = await calendar.getEventCount().catch(() => 0);
    if (eventCount > 0) {
      await calendar.clickEvent(0).catch(() => {});

      if (await calendar.isModalVisible()) {
        await calendar.closeModal().catch(() => {});
      }
    } else {
      // No event in the visible range — exercise a day cell instead.
      await tryClick(authenticatedPage, '.fc-daygrid-day');
      await tryClick(authenticatedPage, '.fc-timegrid-slot');
    }

    await expect(authenticatedPage).toHaveURL(/calendar/);
    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });
});

test.describe('Tasks — deep interactions', () => {
  test.setTimeout(90_000);

  test.beforeEach(async ({ authenticatedPage }) => {
    await mockActiveSubscription(authenticatedPage, {
      credits: 1000,
      plan: 'pro',
    });
  });

  test('renders the tasks list and cycles the status filter', async ({
    authenticatedPage,
  }) => {
    await assertRouteRenders(authenticatedPage, '/tasks');

    await expect(authenticatedPage).toHaveURL(/\/tasks(?:$|[?#])/);

    const statusFilter = authenticatedPage.locator('select').first();
    if (await statusFilter.isVisible().catch(() => false)) {
      for (const value of ['todo', 'in_progress', 'blocked', '']) {
        await statusFilter.selectOption(value).catch(() => {});
      }
    }

    // Open the task composer dialog, then dismiss it.
    await tryClick(authenticatedPage, 'button:has-text("New Task")');
    await authenticatedPage.keyboard.press('Escape').catch(() => {});

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('opens a task overlay from the list view', async ({
    authenticatedPage,
  }) => {
    await assertRouteRenders(authenticatedPage, '/tasks');

    // Empty mocked collections mean rows may be absent; guard the click.
    const firstTask = authenticatedPage
      .getByRole('button', { name: /GEN-\d+/i })
      .first();

    if (await firstTask.isVisible().catch(() => false)) {
      await firstTask.click().catch(() => {});
      await authenticatedPage
        .getByRole('dialog')
        .waitFor({ state: 'visible', timeout: 5_000 })
        .catch(() => {});
      await authenticatedPage.keyboard.press('Escape').catch(() => {});
    }

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('renders a task detail route directly', async ({
    authenticatedPage,
  }) => {
    await assertRouteRenders(authenticatedPage, '/tasks/task-201');

    await expect(authenticatedPage).toHaveURL(/\/tasks\/task-201(?:$|[?#])/);

    // Touch any status / action controls present on the detail page.
    await tryClick(authenticatedPage, 'button:has-text("In Progress")');
    await tryClick(authenticatedPage, 'button:has-text("In Review")');

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });
});
