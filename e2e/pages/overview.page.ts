import type { Locator, Page } from '@playwright/test';

/**
 * Page Object Model for the Overview Page
 *
 * Covers /overview and /overview/activities routes.
 *
 * @module overview.page
 */
export class OverviewPage {
  readonly page: Page;
  readonly url = '/overview';

  // Main layout
  readonly mainContent: Locator;
  readonly sidebar: Locator;
  readonly topbar: Locator;
  readonly topStats: Locator;
  readonly performancePanel: Locator;
  readonly publishingSurface: Locator;
  readonly operationsPanel: Locator;
  readonly runsTable: Locator;
  readonly quickActions: Locator;

  // Loading states
  readonly loadingSpinner: Locator;
  readonly skeleton: Locator;

  // Activities link in sidebar
  readonly navActivities: Locator;
  readonly navStudio: Locator;
  readonly navResearch: Locator;
  readonly navSettings: Locator;

  constructor(page: Page) {
    this.page = page;

    this.mainContent = page.locator('main, [data-testid="main-content"]');
    this.sidebar = page.locator(
      '[data-testid="sidebar"], aside, nav[role="navigation"]',
    );
    this.topbar = page.locator('[data-testid="topbar"], header');
    this.topStats = page.locator('[data-testid="overview-top-stats"]');
    this.performancePanel = page.locator(
      '[data-testid="overview-performance-panel"]',
    );
    this.publishingSurface = page.locator(
      '[data-testid="overview-publishing-surface"]',
    );
    this.operationsPanel = page.locator(
      '[data-testid="overview-operations-panel"]',
    );
    this.runsTable = page.locator('[data-testid="overview-runs-table"]');
    this.quickActions = page.locator('[data-testid="overview-quick-actions"]');

    this.loadingSpinner = page.locator(
      '[data-testid="loading"], .loading, .spinner',
    );
    this.skeleton = page.locator('[data-testid="skeleton"], .skeleton');

    this.navActivities = page.locator(
      'a[href*="activities"], [data-testid="nav-activities"]',
    );
    this.navStudio = page.locator(
      'a[href*="studio"], [data-testid="nav-studio"]',
    );
    this.navResearch = page.locator(
      'a[href*="research"], [data-testid="nav-research"]',
    );
    this.navSettings = page.locator(
      'a[href*="settings"], [data-testid="nav-settings"]',
    );
  }

  async goto(path = this.url): Promise<void> {
    await this.page.goto(path);
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
      await spinner
        .waitFor({ state: 'hidden', timeout: 30000 })
        .catch(() => {});
    }
  }
}
