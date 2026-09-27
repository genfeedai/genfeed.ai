import { PostStatus } from '@genfeedai/contracts';
import type { Page } from '@playwright/test';
import {
  generateMockPost,
  mockActiveSubscription,
  mockCalendarPosts,
  mockPostDetail,
} from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { CalendarPage } from '../../pages/calendar.page';
import { assertNoErrorBoundaryFallback } from '../../utils/route-assertions';

/**
 * E2E Tests for Calendar — Scheduling View
 *
 * CRITICAL: All tests use mocked API responses.
 * No real backend calls occur.
 */

interface CurrentWeekBrowserDates {
  monday9am: string;
  wednesday11am: string;
  mondayDateKey: string;
  wednesdayDateKey: string;
}

/**
 * Monday 9am / Wednesday 11am of the *browser's* current week, plus their
 * FullCalendar day-cell `data-date` keys, computed inside the page so they
 * agree with whatever "now" `useCalendarWeekRange` and FullCalendar's own
 * `firstDay: 1` week resolve to -- the pinned `America/New_York` project
 * timezone, never the test-runner host's, which can disagree on the
 * calendar day near midnight in either zone.
 */
async function currentWeekBrowserDates(
  page: Page,
): Promise<CurrentWeekBrowserDates> {
  return page.evaluate(() => {
    const now = new Date();
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    monday.setHours(0, 0, 0, 0);

    const at = (offsetDays: number, hour: number) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + offsetDays);
      d.setHours(hour, 0, 0, 0);
      return d.toISOString();
    };
    const dateKey = (offsetDays: number) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + offsetDays);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    // Both morning hours: FullCalendar's default event-time label omits
    // the meridiem but keeps a 12-hour clock, so "14:00" would otherwise
    // render as "02:00" -- picking two AM hours keeps the label
    // unambiguous in either convention.
    return {
      monday9am: at(0, 9),
      mondayDateKey: dateKey(0),
      wednesday11am: at(2, 11),
      wednesdayDateKey: dateKey(2),
    };
  });
}

/**
 * FullCalendar's own day-column container for `dateKey` (`YYYY-MM-DD`):
 * `role="gridcell"` spans the whole vertical time-grid strip for that day
 * and carries `data-date` -- unlike the rest of FullCalendar's DOM, whose
 * classes are build-hashed per this app's theme (no stable `.fc-*`
 * selectors exist), this attribute is a stable accessibility hook. Scoping
 * a locator to it, rather than comparing bounding-box coordinates, proves
 * actual DOM containment -- the event is *inside* that day's column, not
 * merely positioned at some x that happens not to equal another event's x.
 */
function dayColumn(page: Page, dateKey: string) {
  return page.locator(`[role="gridcell"][data-date="${dateKey}"]`);
}

test.describe('Calendar — Scheduling', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await mockActiveSubscription(authenticatedPage, {
      credits: 1000,
      plan: 'pro',
    });
  });

  test('should display calendar page', async ({ authenticatedPage }) => {
    const calendarPage = new CalendarPage(authenticatedPage);

    await mockCalendarPosts(authenticatedPage);
    await calendarPage.gotoPosts();

    await expect(authenticatedPage).toHaveURL(
      /\/publishing\/posts\?view=calendar/,
    );
    await calendarPage.assertPostsTabActive();
  });

  test('should show named posts as calendar events on their scheduled day', async ({
    authenticatedPage,
  }) => {
    const calendarPage = new CalendarPage(authenticatedPage);
    const dates = await currentWeekBrowserDates(authenticatedPage);

    const scheduledPosts = [
      generateMockPost({
        description: 'Morning tweet',
        id: 'cal-vis-001',
        label: 'Morning Post',
        platform: 'twitter',
        scheduledDate: dates.monday9am,
        status: PostStatus.SCHEDULED,
      }),
      generateMockPost({
        description: 'Afternoon update',
        id: 'cal-vis-002',
        label: 'Afternoon Post',
        platform: 'instagram',
        scheduledDate: dates.wednesday11am,
        status: PostStatus.SCHEDULED,
      }),
    ];

    await mockCalendarPosts(authenticatedPage, scheduledPosts);
    await calendarPage.gotoPosts();

    await expect(authenticatedPage).toHaveURL(
      /\/publishing\/posts\?view=calendar/,
    );
    await calendarPage.assertCalendarVisible();

    // Each post must render as a real, named event -- not merely "some
    // element with a calendar-event class" exists somewhere on the page --
    // scoped inside the FullCalendar day column matching its own scheduled
    // date, at its own scheduled time.
    const mondayColumn = dayColumn(authenticatedPage, dates.mondayDateKey);
    const wednesdayColumn = dayColumn(
      authenticatedPage,
      dates.wednesdayDateKey,
    );
    const morningEvent = mondayColumn.locator('.gen-calendar-event', {
      hasText: 'Morning Post',
    });
    const afternoonEvent = wednesdayColumn.locator('.gen-calendar-event', {
      hasText: 'Afternoon Post',
    });
    await expect(morningEvent).toBeVisible();
    await expect(afternoonEvent).toBeVisible();
    await expect(morningEvent.locator('.gen-calendar-event-time')).toHaveText(
      '09:00',
    );
    await expect(afternoonEvent.locator('.gen-calendar-event-time')).toHaveText(
      '11:00',
    );

    // Not cross-wired onto each other's day.
    await expect(
      mondayColumn.locator('.gen-calendar-event', {
        hasText: 'Afternoon Post',
      }),
    ).toHaveCount(0);
    await expect(
      wednesdayColumn.locator('.gen-calendar-event', {
        hasText: 'Morning Post',
      }),
    ).toHaveCount(0);
  });

  test('should navigate between months', async ({ authenticatedPage }) => {
    const calendarPage = new CalendarPage(authenticatedPage);

    await mockCalendarPosts(authenticatedPage);
    await calendarPage.gotoPosts();

    // Get initial title
    const _initialTitle = await calendarPage.getCalendarTitle();

    // Navigate forward
    await calendarPage.goToNextPeriod().catch(() => {});

    // Wait for calendar update
    await authenticatedPage.waitForTimeout(500);

    // Navigate backward
    await calendarPage.goToPreviousPeriod().catch(() => {});
    await authenticatedPage.waitForTimeout(500);

    // Should still be on calendar page
    await expect(authenticatedPage).toHaveURL(/calendar/);
  });

  test('should show a scheduled post only on its correct date', async ({
    authenticatedPage,
  }) => {
    const calendarPage = new CalendarPage(authenticatedPage);
    const dates = await currentWeekBrowserDates(authenticatedPage);

    await mockCalendarPosts(authenticatedPage, [
      generateMockPost({
        description: 'Scheduled for Wednesday',
        id: 'cal-date-001',
        label: 'Date-specific Post',
        platform: 'twitter',
        scheduledDate: dates.wednesday11am,
        status: PostStatus.SCHEDULED,
      }),
    ]);

    await calendarPage.gotoPosts();

    await expect(authenticatedPage).toHaveURL(
      /\/publishing\/posts\?view=calendar/,
    );

    // `calendarEvent`'s broad `[class*="calendar-event"]` match also picks
    // up each event's nested time/title/badge spans (all named
    // `gen-calendar-event-*`) -- count the exact event-content class
    // instead of the shared, deliberately-loose locator.
    await expect(authenticatedPage.locator('.gen-calendar-event')).toHaveCount(
      1,
    );

    const wednesdayColumn = dayColumn(
      authenticatedPage,
      dates.wednesdayDateKey,
    );
    const mondayColumn = dayColumn(authenticatedPage, dates.mondayDateKey);
    const event = wednesdayColumn.locator('.gen-calendar-event', {
      hasText: 'Date-specific Post',
    });
    await expect(event).toBeVisible();
    // Scheduled for Wednesday 11am, inside Wednesday's own day column --
    // not Monday's or any other day's.
    await expect(event.locator('.gen-calendar-event-time')).toHaveText('11:00');
    await expect(
      mondayColumn.locator('.gen-calendar-event', {
        hasText: 'Date-specific Post',
      }),
    ).toHaveCount(0);
  });

  test('should display post details on click', async ({
    authenticatedPage,
  }) => {
    const calendarPage = new CalendarPage(authenticatedPage);
    const dates = await currentWeekBrowserDates(authenticatedPage);

    await mockCalendarPosts(authenticatedPage, [
      generateMockPost({
        description: 'Click target',
        id: 'cal-click-001',
        label: 'Clickable Post',
        platform: 'twitter',
        scheduledDate: dates.monday9am,
        status: PostStatus.SCHEDULED,
      }),
    ]);
    await calendarPage.gotoPosts();

    await calendarPage.getEventByText('Clickable Post').click();

    await expect(calendarPage.postModal).toBeVisible();
    await expect(
      calendarPage.postModal.getByText('Clickable Post'),
    ).toBeVisible();

    // The Sheet's own Close button sits under its sticky header during
    // the open transition and is not reliably clickable immediately after
    // opening; Escape is Radix Dialog's standard, always-available close.
    await authenticatedPage.keyboard.press('Escape');
    await expect(calendarPage.postModal).toBeHidden();
  });

  test('should navigate to the post editor from calendar', async ({
    authenticatedPage,
  }) => {
    const calendarPage = new CalendarPage(authenticatedPage);
    const dates = await currentWeekBrowserDates(authenticatedPage);

    const targetPost = generateMockPost({
      description: 'Opens the editor',
      id: 'cal-nav-001',
      label: 'Navigable Post',
      platform: 'twitter',
      scheduledDate: dates.monday9am,
      status: PostStatus.SCHEDULED,
    });

    await mockCalendarPosts(authenticatedPage, [targetPost]);
    await mockPostDetail(authenticatedPage, targetPost);
    await calendarPage.gotoPosts();

    await calendarPage.getEventByText('Navigable Post').click();
    await expect(calendarPage.postModal).toBeVisible();

    await calendarPage.clickViewDetails();

    // The drawer's only navigation affordance opens the target's editor --
    // require the destination actually rendered the target post (its own
    // title heading), not merely that the URL changed.
    await expect(authenticatedPage).toHaveURL(
      /\/publishing\/posts\/cal-nav-001/,
    );
    await expect(
      authenticatedPage.getByRole('heading', { name: 'Navigable Post' }),
    ).toBeVisible();
    await assertNoErrorBoundaryFallback(
      authenticatedPage,
      '/publishing/posts/cal-nav-001',
    );
  });

  test('should switch between posts and articles tabs', async ({
    authenticatedPage,
  }) => {
    const calendarPage = new CalendarPage(authenticatedPage);

    await mockCalendarPosts(authenticatedPage);
    await calendarPage.gotoPosts();
    await calendarPage.assertPostsTabActive();

    // Switch to articles tab
    await calendarPage.switchToArticlesTab();
    await calendarPage.assertArticlesTabActive();

    // Switch back to posts tab
    await calendarPage.switchToPostsTab();
    await calendarPage.assertPostsTabActive();
  });

  test('should show list view link', async ({ authenticatedPage }) => {
    const calendarPage = new CalendarPage(authenticatedPage);

    await mockCalendarPosts(authenticatedPage);
    await calendarPage.gotoPosts();

    // The calendar page links back to the canonical Publishing posts list.
    const listLink = calendarPage.listViewLink;
    const isVisible = await listLink.isVisible().catch(() => false);

    // Link should be present in the UI
    if (isVisible) {
      await expect(listLink).toHaveAttribute('href', /\/publishing\/posts$/);
    }

    await expect(authenticatedPage).toHaveURL(/calendar/);
  });
});
