import type { Locator, Page } from '@playwright/test';

/**
 * Page Object Model for the Research Pages
 *
 * Covers /research, /research/discovery, /research/socials,
 * /research/ads, /research/ads/google, /research/ads/meta routes.
 *
 * @module research.page
 */
export class ResearchPage {
  readonly page: Page;
  readonly url = '/research';

  // Main layout
  readonly mainContent: Locator;
  readonly sidebar: Locator;

  // Loading states
  readonly loadingSpinner: Locator;
  readonly skeleton: Locator;

  // Navigation
  readonly discoveryTab: Locator;
  readonly socialsTab: Locator;
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

    this.discoveryTab = page.locator(
      'a[href*="research/discovery"],' +
        ' button:has-text("Discovery"),' +
        ' [data-testid="research-discovery-tab"]',
    );
    this.socialsTab = page.locator(
      'a[href*="research/socials"],' +
        ' button:has-text("Socials"),' +
        ' [data-testid="research-socials-tab"]',
    );
    this.adsTab = page.locator(
      'a[href*="research/ads"],' +
        ' button:has-text("Ads"),' +
        ' [data-testid="research-ads-tab"]',
    );
  }

  async goto(path = this.url): Promise<void> {
    await this.page.goto(path);
    await this.waitForPageLoad();
  }

  async gotoSection(
    section: 'discovery' | 'socials' | 'ads' | 'ads/google' | 'ads/meta',
  ): Promise<void> {
    await this.page.goto(`/research/${section}`);
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
