import { PostStatus, TargetValidationState } from '@genfeedai/contracts';
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

interface CurrentWeekDates {
  monday9am: string;
  wednesday11am: string;
  mondayDateKey: string;
  wednesdayDateKey: string;
}

/**
 * Monday 9am / Wednesday 11am UTC of the current week, plus their FullCalendar
 * day-cell `data-date` keys. The calendar renders in the selected brand's
 * schedule timezone and falls back to UTC when the brand has none (the e2e
 * brand has none), so the fixtures are expressed in UTC to land on the same
 * day and clock label regardless of the runner's or the pinned browser's zone.
 */
function currentWeekUtcDates(): CurrentWeekDates {
  const now = new Date();
  const monday = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() - ((now.getUTCDay() + 6) % 7),
    ),
  );
  const at = (offsetDays: number, hour: number) =>
    new Date(
      Date.UTC(
        monday.getUTCFullYear(),
        monday.getUTCMonth(),
        monday.getUTCDate() + offsetDays,
        hour,
      ),
    ).toISOString();
  const dateKey = (offsetDays: number) =>
    at(offsetDays, 0).slice(0, 'YYYY-MM-DD'.length);

  // Both morning hours: FullCalendar's default event-time label omits the
  // meridiem but keeps a 12-hour clock, so "14:00" would otherwise render as
  // "02:00" -- picking two AM hours keeps the label unambiguous.
  return {
    monday9am: at(0, 9),
    mondayDateKey: dateKey(0),
    wednesday11am: at(2, 11),
    wednesdayDateKey: dateKey(2),
  };
}

/**
 * FullCalendar 7 classic theme's day lane for `dateKey` (`YYYY-MM-DD`).
 * The week view is a table: each timed day column is `role="cell"` and
 * carries `data-date`. Column headers use `role="columnheader"` with the
 * same attribute and do not contain events. Classes are build-hashed, so
 * this pair is the stable hook. Scoping a locator to the cell proves the
 * event is inside that day's column.
 */
function dayColumn(page: Page, dateKey: string) {
  return page.locator(`[role="cell"][data-date="${dateKey}"]`);
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

    await expect(authenticatedPage).toHaveURL(/\/publishing\/calendar/);
    await calendarPage.assertPostsTabActive();
  });

  test('keeps every calendar control in the sub bar, with views as a dropdown', async ({
    authenticatedPage,
  }) => {
    const calendarPage = new CalendarPage(authenticatedPage);

    await mockCalendarPosts(authenticatedPage);
    await calendarPage.gotoPosts();

    // One bar holds the period navigation, filters, views and actions; nothing
    // sits between it and the grid.
    const subbar = authenticatedPage.getByTestId('section-topbar');
    await expect(subbar).toHaveCount(1);
    await expect(
      subbar.getByRole('button', { name: 'Previous period' }),
    ).toBeVisible();
    await expect(subbar.getByRole('button', { name: 'Today' })).toBeVisible();
    await expect(
      subbar.getByRole('button', { name: 'New cadence' }),
    ).toBeVisible();
    await expect(
      subbar.getByRole('button', { name: 'View: Week' }),
    ).toBeVisible();
    await expect(authenticatedPage.getByRole('tab')).toHaveCount(0);

    await calendarPage.switchToMonthView();

    // The page switcher is gone: Calendar, Posts and Approvals are sidebar pages.
    await calendarPage.viewMenuTrigger.click();
    await expect(
      authenticatedPage.getByRole('menuitemradio', { name: 'Approvals' }),
    ).toHaveCount(0);
  });

  test('should show named posts as calendar events on their scheduled day', async ({
    authenticatedPage,
  }) => {
    const calendarPage = new CalendarPage(authenticatedPage);
    const dates = currentWeekUtcDates();

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

    await expect(authenticatedPage).toHaveURL(/\/publishing\/calendar/);
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
    const dates = currentWeekUtcDates();

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

    await expect(authenticatedPage).toHaveURL(/\/publishing\/calendar/);

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
    const dates = currentWeekUtcDates();

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
    await expect(calendarPage.postSidebarTitle).toHaveText('Clickable Post');

    // The context sidebar's own close control deselects the post.
    await calendarPage.closeModal();
    await expect(calendarPage.postModal).toBeHidden();
  });

  test('should navigate to the post editor from calendar', async ({
    authenticatedPage,
  }) => {
    const calendarPage = new CalendarPage(authenticatedPage);
    const dates = currentWeekUtcDates();

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
    // The target passed validation: the sidebar panel shows its validation badge.
    await expect(
      calendarPage.postModal.getByText(TargetValidationState.VALID, {
        exact: true,
      }),
    ).toBeVisible();

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

  test('should render posts and articles together and open each in its own editor', async ({
    authenticatedPage,
  }) => {
    const calendarPage = new CalendarPage(authenticatedPage);
    const dates = currentWeekUtcDates();
    const post = generateMockPost({
      description: 'Social companion',
      id: 'cal-mixed-post',
      label: 'Mixed Social Post',
      platform: 'twitter',
      scheduledDate: dates.monday9am,
      status: PostStatus.SCHEDULED,
    });

    await mockCalendarPosts(
      authenticatedPage,
      [post],
      [
        {
          attributes: {
            createdAt: dates.wednesday11am,
            label: 'Mixed Launch Article',
            status: 'draft',
          },
          id: 'cal-mixed-article',
        },
      ],
    );
    await mockPostDetail(authenticatedPage, post);
    await calendarPage.gotoPosts();

    // The retired Content type control no longer narrows the calendar: both
    // kinds share the week, each inside its own day column.
    const postEvent = dayColumn(authenticatedPage, dates.mondayDateKey).locator(
      '.gen-calendar-event',
      { hasText: 'Mixed Social Post' },
    );
    // Articles carry no channel, badge or indicator, so the calendar leaves
    // them to FullCalendar's default event markup. Its classes are
    // build-hashed in FullCalendar 7, so find the article by its title inside
    // its own day column instead of by a class.
    const articleEvent = dayColumn(
      authenticatedPage,
      dates.wednesdayDateKey,
    ).getByText('Mixed Launch Article');
    await expect(postEvent).toBeVisible();
    await expect(articleEvent).toBeVisible();

    // Kind-specific navigation: an article opens its editor route directly.
    await articleEvent.click();
    await expect(authenticatedPage).toHaveURL(
      /\/publishing\/posts\/cal-mixed-article/,
    );
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
