import { sidebarLocator } from '@e2e/utils/app-chrome';
import type { Locator, Page } from '@playwright/test';

/**
 * Page Object Model for the Discovery pages
 *
 * Covers /discovery, /discovery/overview, /discovery/socials,
 * /discovery/following, /discovery/ads (+ google/meta) routes.
 *
 * @module discovery.page
 */
export class DiscoveryPage {
  readonly page: Page;
  readonly url = '/discovery';

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
    this.sidebar = sidebarLocator(page);

    this.loadingSpinner = page.locator(
      '[data-testid="loading"], .loading, .spinner',
    );
    this.skeleton = page.locator('[data-testid="skeleton"], .skeleton');

    this.overviewTab = page.locator(
      'a[href*="discovery/overview"],' +
        ' button:has-text("Overview"),' +
        ' [data-testid="discovery-overview-tab"]',
    );
    this.socialsTab = page.locator(
      'a[href*="discovery/socials"],' +
        ' button:has-text("Socials"),' +
        ' [data-testid="discovery-socials-tab"]',
    );
    this.followingTab = page.locator(
      'a[href*="discovery/following"],' +
        ' button:has-text("Following"),' +
        ' [data-testid="discovery-following-tab"]',
    );
    this.adsTab = page.locator(
      'a[href*="discovery/ads"],' +
        ' button:has-text("Ads"),' +
        ' [data-testid="discovery-ads-tab"]',
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
    await this.page.goto(`/discovery/${section}`);
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
