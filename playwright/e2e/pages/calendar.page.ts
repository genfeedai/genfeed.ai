import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { brandPath } from '../utils/app-chrome';
import { assertNoErrorBoundaryFallback } from '../utils/route-assertions';

/**
 * Page Object Model for the Calendar Page
 *
 * Provides an abstraction layer for interacting with
 * the content calendar (posts and articles views).
 *
 * @module calendar.page
 */
export class CalendarPage {
  readonly page: Page;

  // Layout
  readonly mainContent: Locator;
  readonly loadingFallback: Locator;

  // Content-type filter. Posts vs Articles is a `type` query-param filter
  // on the unified content library toolbar now, not a separate calendar tab
  // -- the toolbar stays mounted (via PostsLayoutContext) even in calendar
  // view. See #5381.
  readonly contentTypeFilterTrigger: Locator;

  // Calendar grid
  readonly calendarGrid: Locator;
  readonly calendarEvent: Locator;
  readonly calendarDayCell: Locator;

  // Navigation
  readonly prevButton: Locator;
  readonly nextButton: Locator;
  readonly todayButton: Locator;
  readonly monthLabel: Locator;

  // View toggles
  readonly weekViewButton: Locator;
  readonly monthViewButton: Locator;

  // Filter controls
  readonly listViewLink: Locator;

  // Modal
  readonly postModal: Locator;
  readonly modalCloseButton: Locator;
  readonly viewDetailsButton: Locator;

  constructor(page: Page) {
    this.page = page;

    this.mainContent = page.locator('main, [data-testid="main-content"]');
    this.loadingFallback = page.locator(
      '[data-testid="loading"], .loading, .spinner',
    );

    // Posts calendar is canonical. Articles are a type-filtered view of the
    // unified Publishing content library, selected from this Select.
    this.contentTypeFilterTrigger = page.locator(
      'button[role="combobox"][aria-label="Content type"]',
    );

    // Calendar grid elements
    this.calendarGrid = page.locator(
      '[data-testid="calendar-grid"],' +
        ' [data-testid="content-calendar"],' +
        ' .fc, .rbc-calendar, [class*="calendar"]',
    );
    this.calendarEvent = page.locator(
      '[data-testid="calendar-event"],' +
        ' .fc-event, .rbc-event,' +
        ' [class*="calendar-event"]',
    );
    this.calendarDayCell = page.locator(
      '.fc-daygrid-day, .rbc-day-bg,' + ' [data-testid="calendar-day"]',
    );

    // Navigation controls
    this.prevButton = page.locator(
      'button:has-text("Previous"),' +
        ' button:has-text("Prev"),' +
        ' button[aria-label*="prev" i],' +
        ' button[aria-label*="back" i],' +
        ' [data-testid="calendar-prev"]',
    );
    this.nextButton = page.locator(
      'button:has-text("Next"),' +
        ' button[aria-label*="next" i],' +
        ' button[aria-label*="forward" i],' +
        ' [data-testid="calendar-next"]',
    );
    this.todayButton = page.locator(
      'button:has-text("Today"),' + ' [data-testid="calendar-today"]',
    );
    // The custom toolbar (ContentCalendarView) renders `headerToolbar:
    // false` and its own h2 next to the nav buttons -- there is no
    // `.fc-toolbar-title` or `calendar-header`-classed wrapper any more.
    this.monthLabel = page.locator(
      '[data-testid="calendar-title"],' +
        ' .fc-toolbar-title,' +
        ' div:has(button[aria-label="Previous period"]) h2',
    );

    // View toggles
    this.weekViewButton = page.locator(
      'button:has-text("Week"),' + ' [data-testid="view-week"]',
    );
    this.monthViewButton = page.locator(
      'button:has-text("Month"),' + ' [data-testid="view-month"]',
    );

    // Filter controls
    this.listViewLink = page.locator(
      `a[href$="${APP_ROUTES.PUBLISHING.POSTS}"]`,
    );

    // ReleaseDetailDrawer (a Radix Dialog/Sheet, role="dialog"). It has no
    // "View Details" control -- the drawer *is* the detail view; its one
    // navigation affordance is a link to the target's editor, labelled
    // "Open editor" (`pages.publishing.release.openEditor`). See #5381.
    this.postModal = page.locator('[role="dialog"]');
    this.modalCloseButton = page.locator(
      '[role="dialog"] button[aria-label="Close"],' +
        ' [role="dialog"] button:has-text("Close")',
    );
    this.viewDetailsButton = page.locator(
      '[role="dialog"] a:has-text("Open editor")',
    );
  }

  // ── Navigation ──────────────────────────────────────────

  async gotoPosts(): Promise<void> {
    // A bare (org/brand-less) protected route resolves through the
    // proxy's hosted-mode-misconfiguration fallback, which can land on a
    // seeded `/default/default` workspace instead of the mocked-auth
    // `test-org/brand-1` one -- the same nondeterminism #5361 saw. Navigate
    // to the canonical mocked workspace deep link instead.
    await this.page.goto(brandPath(APP_ROUTES.PUBLISHING.CALENDAR));
    await this.waitForPageLoad();
  }

  async waitForPageLoad(): Promise<void> {
    await this.page.waitForLoadState('domcontentloaded');
    await this.mainContent
      .waitFor({ state: 'visible', timeout: 15000 })
      .catch(() => {});
    const spinner = this.loadingFallback;
    const visible = await spinner.isVisible().catch(() => false);
    if (visible) {
      await spinner.waitFor({
        state: 'hidden',
        timeout: 30000,
      });
    }
    // A URL assertion alone can pass while the route rendered a caught
    // ErrorBoundary fallback instead of the real surface. See #5381.
    await assertNoErrorBoundaryFallback(
      this.page,
      new URL(this.page.url()).pathname,
    );
  }

  // ── Content-type filter interactions ───────────────────

  async switchToPostsTab(): Promise<void> {
    await this.contentTypeFilterTrigger.click();
    await this.page
      .getByRole('option', { name: 'Social posts', exact: true })
      .click();
    await this.waitForPageLoad();
  }

  async switchToArticlesTab(): Promise<void> {
    await this.contentTypeFilterTrigger.click();
    await this.page
      .getByRole('option', { name: 'Articles', exact: true })
      .click();
    await this.waitForPageLoad();
  }

  // ── Date navigation ────────────────────────────────────

  async goToPreviousPeriod(): Promise<void> {
    await this.prevButton.first().click();
    await this.page.waitForTimeout(500);
  }

  async goToNextPeriod(): Promise<void> {
    await this.nextButton.first().click();
    await this.page.waitForTimeout(500);
  }

  async goToToday(): Promise<void> {
    await this.todayButton.first().click();
    await this.page.waitForTimeout(500);
  }

  async getCalendarTitle(): Promise<string> {
    return (await this.monthLabel.first().textContent()) || '';
  }

  // ── View toggles ───────────────────────────────────────

  async switchToWeekView(): Promise<void> {
    await this.weekViewButton.first().click();
    await this.page.waitForTimeout(500);
  }

  async switchToMonthView(): Promise<void> {
    await this.monthViewButton.first().click();
    await this.page.waitForTimeout(500);
  }

  // ── Calendar event interactions ────────────────────────

  async getEventCount(): Promise<number> {
    return await this.calendarEvent.count();
  }

  async clickEvent(index = 0): Promise<void> {
    await this.calendarEvent.nth(index).click();
  }

  async getEventText(index = 0): Promise<string> {
    return (await this.calendarEvent.nth(index).textContent()) || '';
  }

  /** Locates a specific rendered event by its title, not by fragile index. */
  getEventByText(title: string): Locator {
    return this.calendarEvent.filter({ hasText: title }).first();
  }

  // ── Modal interactions ─────────────────────────────────

  async isModalVisible(): Promise<boolean> {
    return await this.postModal.isVisible().catch(() => false);
  }

  async closeModal(): Promise<void> {
    await this.modalCloseButton.first().click();
    await this.postModal.waitFor({ state: 'hidden' });
  }

  async clickViewDetails(): Promise<void> {
    await this.viewDetailsButton.first().click();
  }

  // ── Assertions ─────────────────────────────────────────

  async assertCalendarVisible(): Promise<void> {
    await expect(this.calendarGrid.first()).toBeVisible();
  }

  async assertEventsDisplayed(minCount = 1): Promise<void> {
    const count = await this.getEventCount();
    expect(count).toBeGreaterThanOrEqual(minCount);
  }

  async assertPostsTabActive(): Promise<void> {
    // The calendar is the unified Posts desk's calendar view
    // (`/publishing/posts?view=calendar`); assert it is still in calendar
    // view and not filtered to one of the other content types (excluding
    // only 'article' let 'newsletter' through as "posts tab active" too).
    await expect(this.page).toHaveURL(
      (url) =>
        url.pathname.endsWith(APP_ROUTES.PUBLISHING.POSTS) &&
        url.searchParams.get('view') === 'calendar' &&
        url.searchParams.get('type') !== 'article' &&
        url.searchParams.get('type') !== 'newsletter',
    );
  }

  /**
   * Stricter than `assertPostsTabActive`: asserts the type filter is
   * explicitly `post` (e.g. right after `switchToPostsTab()` picks "Social
   * posts" from the Select), not merely "not article/newsletter".
   */
  async assertSocialPostsFilterActive(): Promise<void> {
    await expect(this.page).toHaveURL(
      (url) =>
        url.pathname.endsWith(APP_ROUTES.PUBLISHING.POSTS) &&
        url.searchParams.get('view') === 'calendar' &&
        url.searchParams.get('type') === 'post',
    );
  }

  async assertArticlesTabActive(): Promise<void> {
    await expect(this.page).toHaveURL(
      (url) =>
        url.pathname.endsWith(APP_ROUTES.PUBLISHING.POSTS) &&
        url.searchParams.get('view') === 'calendar' &&
        url.searchParams.get('type') === 'article',
    );
    await expect(this.mainContent.first()).toBeVisible();
  }
}
