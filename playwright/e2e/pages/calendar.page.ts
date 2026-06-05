import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';

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

  // Tabs
  readonly postsTab: Locator;
  readonly articlesTab: Locator;

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

    // Calendar layout tabs
    this.postsTab = page.locator('a[href="/calendar/posts"]');
    this.articlesTab = page.locator('a[href="/calendar/articles"]');

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
    this.monthLabel = page.locator(
      '[data-testid="calendar-title"],' +
        ' .fc-toolbar-title,' +
        ' [class*="calendar-header"] h2,' +
        ' [class*="calendar-header"] span',
    );

    // View toggles
    this.weekViewButton = page.locator(
      'button:has-text("Week"),' + ' [data-testid="view-week"]',
    );
    this.monthViewButton = page.locator(
      'button:has-text("Month"),' + ' [data-testid="view-month"]',
    );

    // Filter controls
    this.listViewLink = page.locator('a[href="/posts"]');

    // Post modal
    this.postModal = page.locator('[role="dialog"]');
    this.modalCloseButton = page.locator(
      '[role="dialog"] button[aria-label="Close"],' +
        ' [role="dialog"] button:has-text("Close")',
    );
    this.viewDetailsButton = page.locator(
      '[role="dialog"] button:has-text("View Details"),' +
        ' [role="dialog"] a:has-text("View Details")',
    );
  }

  // ── Navigation ──────────────────────────────────────────

  async gotoPosts(): Promise<void> {
    await this.page.goto('/calendar/posts');
    await this.waitForPageLoad();
  }

  async gotoArticles(): Promise<void> {
    await this.page.goto('/calendar/articles');
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
  }

  // ── Tab interactions ────────────────────────────────────

  async switchToPostsTab(): Promise<void> {
    await this.postsTab.click();
    await this.waitForPageLoad();
  }

  async switchToArticlesTab(): Promise<void> {
    await this.articlesTab.click();
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
    await expect(this.page).toHaveURL(/calendar\/posts/);
  }

  async assertArticlesTabActive(): Promise<void> {
    await expect(this.page).toHaveURL(/calendar\/articles/);
  }
}
