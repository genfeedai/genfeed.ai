import type { Locator, Page } from '@playwright/test';
import { brandPath, sidebarLocator } from '../utils/app-chrome';

/**
 * Page Object Model for the Analytics Page
 *
 * Provides an abstraction layer for interacting with
 * analytics views: overview, trends, hooks, insights.
 *
 * @module analytics.page
 */
export class AnalyticsPage {
  readonly page: Page;
  readonly url = brandPath('/analytics');

  // Main layout
  readonly mainContent: Locator;

  // Navigation tabs — scoped to the primary sidebar landmark. The nav tree is
  // duplicated in the DOM for the mobile drawer, so an unscoped
  // `a[href*="analytics/trends"]` trips Playwright strict mode; `sidebarLocator`
  // already resolves to a single instance (same pattern as dashboard.page.ts /
  // admin.page.ts).
  readonly overviewTab: Locator;
  readonly trendsTab: Locator;
  readonly hooksTab: Locator;
  readonly insightsTab: Locator;

  // Insights feed card (`InsightListCard`) — the insights page renders a list
  // of AI-generated insights, not charts or metric cards.
  readonly insightsListCard: Locator;

  // Filters
  readonly dateRangeSelector: Locator;

  // Loading
  readonly loadingSpinner: Locator;

  constructor(page: Page) {
    this.page = page;

    this.mainContent = page.locator('main, [data-testid="main-content"]');

    // Navigation — scoped inside the single resolved sidebar container.
    const sidebar = sidebarLocator(page);
    this.overviewTab = sidebar.getByRole('link', {
      exact: true,
      name: 'Overview',
    });
    this.trendsTab = sidebar.getByRole('link', {
      exact: true,
      name: 'Trends',
    });
    this.hooksTab = sidebar.getByRole('link', { exact: true, name: 'Hooks' });
    this.insightsTab = sidebar.getByRole('link', {
      exact: true,
      name: 'Insights',
    });

    this.insightsListCard = page.getByTestId('insight-list-card');

    // Filters
    // The layout's `FormDateRangePicker` trigger, labelled with the selected
    // range (e.g. "Sep 20 - Sep 26, 2026").
    this.dateRangeSelector = page.locator('main').getByRole('button', {
      name: /^[A-Z][a-z]{2} \d{1,2}(, \d{4})? - [A-Z][a-z]{2} \d{1,2}, \d{4}$/,
    });

    // Loading
    this.loadingSpinner = page.locator(
      '[data-testid="loading"], .loading, .spinner',
    );
  }

  /**
   * A page's own title heading inside `main` (the analytics layout's
   * `Container` renders each sub-page's label as a heading), so a
   * render check fails on an empty shell instead of passing on any `main`.
   */
  sectionHeading(name: string): Locator {
    return this.page
      .locator('main')
      .getByRole('heading', { exact: true, name });
  }

  async goto(): Promise<void> {
    await this.page.goto(this.url);
    await this.waitForPageLoad();
  }

  async gotoSection(
    section: 'overview' | 'trends' | 'hooks' | 'insights' | 'accounts',
  ): Promise<void> {
    await this.page.goto(brandPath(`/analytics/${section}`));
    await this.waitForPageLoad();
  }

  async waitForPageLoad(): Promise<void> {
    await this.page.waitForLoadState('domcontentloaded');
    await this.mainContent
      .waitFor({ state: 'visible', timeout: 15000 })
      .catch(() => {});

    const spinner = this.loadingSpinner;
    const isVisible = await spinner.isVisible().catch(() => false);
    if (isVisible) {
      await spinner.waitFor({
        state: 'hidden',
        timeout: 30000,
      });
    }
  }

  // These are client-side (Next.js Link) transitions, not full page loads —
  // `waitForLoadState('domcontentloaded')` alone can resolve immediately
  // against the *current* page and race the SPA route change. Wait on the
  // real signal (the URL actually changing) instead, matching
  // `DashboardPage`'s `#gotoOrClick` convention.
  async navigateToOverview(): Promise<void> {
    await this.overviewTab.click();
    // Exact overview pathname only — `(\/overview)?` being optional made
    // this match *every* analytics subroute (e.g. `/analytics/trends`),
    // so a stale page could satisfy this wait.
    await this.page.waitForURL(/\/analytics\/overview(?:[/?#]|$)/);
  }

  async navigateToTrends(): Promise<void> {
    await this.trendsTab.click();
    await this.page.waitForURL(/\/analytics\/trends(?:[/?#]|$)/);
  }

  async navigateToHooks(): Promise<void> {
    await this.hooksTab.click();
    await this.page.waitForURL(/\/analytics\/hooks(?:[/?#]|$)/);
  }

  async navigateToInsights(): Promise<void> {
    await this.insightsTab.click();
    await this.page.waitForURL(/\/analytics\/insights(?:[/?#]|$)/);
  }

  /** Pick one of the date range picker's presets (7, 30 or 90 days). */
  async selectDateRangePreset(days: 7 | 30 | 90): Promise<void> {
    await this.dateRangeSelector.click();
    await this.page
      .getByRole('button', { exact: true, name: `Last ${days} days` })
      .click();
  }
}
