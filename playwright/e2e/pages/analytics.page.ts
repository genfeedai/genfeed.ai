import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
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
  readonly accountsTab: Locator;

  // Metrics
  readonly engagementMetrics: Locator;
  readonly metricCard: Locator;

  // Charts
  readonly chartContainer: Locator;
  readonly chartCanvas: Locator;

  // Shared list/table empty state (`@ui/display/table/Table` and
  // `CardEmpty`) — the real testids the app renders, not a fictional
  // "empty-state" hook.
  readonly emptyState: Locator;

  // Insights feed card (`InsightListCard`) — the insights page renders a list
  // of AI-generated insights, not charts or metric cards.
  readonly insightsListCard: Locator;

  // Filters
  readonly dateRangeSelector: Locator;
  readonly platformFilter: Locator;
  readonly contentTypeFilter: Locator;

  // Export
  readonly exportButton: Locator;

  // Loading
  readonly loadingSpinner: Locator;
  readonly skeleton: Locator;

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
    this.accountsTab = sidebar.getByRole('link', {
      exact: true,
      name: 'Accounts',
    });

    // Metrics
    this.engagementMetrics = page.locator(
      '[data-testid="engagement-metrics"],' +
        ' [data-testid="metrics-grid"],' +
        ' .metrics-container',
    );
    this.metricCard = page.locator(
      '[data-testid="metric-card"],' +
        ' [data-testid="stat-card"],' +
        ' .metric-card',
    );

    // Charts
    this.chartContainer = page.locator(
      '[data-testid="chart-container"],' +
        ' [data-testid="chart"],' +
        ' .chart-wrapper,' +
        ' .recharts-wrapper',
    );
    this.chartCanvas = page.locator('canvas, svg.recharts-surface');

    this.emptyState = page.locator(
      '[data-testid="table-empty"], [data-testid="card-empty"]',
    );
    this.insightsListCard = page.getByTestId('insight-list-card');

    // Filters
    this.dateRangeSelector = page.locator(
      '[data-testid="date-range-selector"],' +
        ' [data-testid="date-range"],' +
        ' button:has-text("Last"),' +
        ' button:has-text("Date Range")',
    );
    this.platformFilter = page.locator(
      '[data-testid="platform-filter"],' +
        ' [data-testid="platform-select"],' +
        ' button:has-text("Platform")',
    );
    this.contentTypeFilter = page.locator(
      '[data-testid="content-type-filter"],' +
        ' [data-testid="content-type-select"],' +
        ' button:has-text("Content Type")',
    );

    // Export
    this.exportButton = page.locator(
      '[data-testid="export-button"],' +
        ' button:has-text("Export"),' +
        ' button:has-text("Download")',
    );

    // Loading
    this.loadingSpinner = page.locator(
      '[data-testid="loading"], .loading, .spinner',
    );
    this.skeleton = page.locator('[data-testid="skeleton"], .skeleton');
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
    await this.page.waitForURL(/\/analytics(\/overview)?(?:[/?#]|$)/);
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

  async selectDateRange(range: string): Promise<void> {
    await this.dateRangeSelector.click();
    await this.page.locator(`[role="option"]:has-text("${range}")`).click();
  }

  async selectPlatform(platform: string): Promise<void> {
    await this.platformFilter.click();
    await this.page.locator(`[role="option"]:has-text("${platform}")`).click();
  }

  async selectContentType(type: string): Promise<void> {
    await this.contentTypeFilter.click();
    await this.page.locator(`[role="option"]:has-text("${type}")`).click();
  }

  async clickExport(): Promise<void> {
    await this.exportButton.click();
  }

  async getMetricCount(): Promise<number> {
    return await this.metricCard.count();
  }

  async getChartCount(): Promise<number> {
    return await this.chartContainer.count();
  }

  async isDisplayed(): Promise<boolean> {
    return this.page.url().includes('/analytics');
  }

  async assertMetricsVisible(): Promise<void> {
    const count = await this.getMetricCount();
    expect(count).toBeGreaterThan(0);
  }

  async assertChartsVisible(): Promise<void> {
    const count = await this.getChartCount();
    expect(count).toBeGreaterThan(0);
  }
}
