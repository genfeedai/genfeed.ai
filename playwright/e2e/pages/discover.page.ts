import type { Locator, Page } from '@playwright/test';

/**
 * Page Object Model for the Discover Pages
 *
 * Covers /discover, /discover/overview, /discover/socials,
 * /discover/following, /discover/ads (+ google/meta) routes.
 *
 * @module discover.page
 */
export class DiscoverPage {
  readonly page: Page;
  readonly url = '/discover';

  // Main layout
  readonly mainContent: Locator;
  readonly sidebar: Locator;

  // Loading states
  readonly loadingSpinner: Locator;
  readonly skeleton: Locator;

  // Navigation
  readonly overviewTab: Locator;
  readonly socialsTab: Locator;
  readonly followingTab: Locator;
  readonly adsTab: Locator;

  constructor(page: Page) {
    this.page = page;

    this.mainContent = page.locator('main, [data-testid="main-content"]');
    this.sidebar = page.locator(
      '[data-testid="sidebar"], aside, nav[role="navigation"]',
    );

    this.loadingSpinner = page.locator(
      '[data-testid="loading"], .loading, .spinner',
    );
    this.skeleton = page.locator('[data-testid="skeleton"], .skeleton');

    this.overviewTab = page.locator(
      'a[href*="discover/overview"],' +
        ' button:has-text("Overview"),' +
        ' [data-testid="discover-overview-tab"]',
    );
    this.socialsTab = page.locator(
      'a[href*="discover/socials"],' +
        ' button:has-text("Socials"),' +
        ' [data-testid="discover-socials-tab"]',
    );
    this.followingTab = page.locator(
      'a[href*="discover/following"],' +
        ' button:has-text("Following"),' +
        ' [data-testid="discover-following-tab"]',
    );
    this.adsTab = page.locator(
      'a[href*="discover/ads"],' +
        ' button:has-text("Ads"),' +
        ' [data-testid="discover-ads-tab"]',
    );
  }

  async goto(path = this.url): Promise<void> {
    await this.page.goto(path);
    await this.waitForPageLoad();
  }

  async gotoSection(
    section:
      | 'overview'
      | 'socials'
      | 'following'
      | 'ads'
      | 'ads/google'
      | 'ads/meta',
  ): Promise<void> {
    await this.page.goto(`/discover/${section}`);
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
