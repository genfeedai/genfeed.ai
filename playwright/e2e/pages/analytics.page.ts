import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';

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
  readonly url = '/analytics/overview';

  // Main layout
  readonly mainContent: Locator;

  // Navigation tabs
  readonly overviewTab: Locator;
  readonly trendsTab: Locator;
  readonly hooksTab: Locator;
  readonly insightsTab: Locator;

  // Metrics
  readonly engagementMetrics: Locator;
  readonly metricCard: Locator;

  // Charts
  readonly chartContainer: Locator;
  readonly chartCanvas: Locator;

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

    // Navigation
    this.overviewTab = page.locator(
      'a[href*="analytics/overview"],' +
        ' button:has-text("Overview"),' +
        ' [data-testid="analytics-overview-tab"]',
    );
    this.trendsTab = page.locator(
      'a[href*="analytics/trends"],' +
        ' button:has-text("Trends"),' +
        ' [data-testid="analytics-trends-tab"]',
    );
    this.hooksTab = page.locator(
      'a[href*="analytics/hooks"],' +
        ' button:has-text("Hooks"),' +
        ' [data-testid="analytics-hooks-tab"]',
    );
    this.insightsTab = page.locator(
      'a[href*="analytics/insights"],' +
        ' button:has-text("Insights"),' +
        ' [data-testid="analytics-insights-tab"]',
    );

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
    section: 'overview' | 'trends' | 'hooks' | 'insights',
  ): Promise<void> {
    await this.page.goto(`/analytics/${section}`);
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

  async navigateToOverview(): Promise<void> {
    await this.overviewTab.click();
    await this.page.waitForLoadState('domcontentloaded');
  }

  async navigateToTrends(): Promise<void> {
    await this.trendsTab.click();
    await this.page.waitForLoadState('domcontentloaded');
  }

  async navigateToHooks(): Promise<void> {
    await this.hooksTab.click();
    await this.page.waitForLoadState('domcontentloaded');
  }

  async navigateToInsights(): Promise<void> {
    await this.insightsTab.click();
    await this.page.waitForLoadState('domcontentloaded');
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
