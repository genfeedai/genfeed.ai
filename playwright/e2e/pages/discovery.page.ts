import { sidebarLocator } from '@e2e/utils/app-chrome';
import type { Locator, Page } from '@playwright/test';

/**
 * Page Object Model for the Discovery pages.
 *
 * Covers /discovery (redirects to /discovery/overview), /discovery/overview
 * (the "Signal Desk") and /discovery/ads (platform is a tab/query filter on
 * this one page, not a route). #4317 (closes #4299) hard-retired
 * /discovery/socials, /discovery/following, /discovery/discovery,
 * /discovery/[platform], and /discovery/ads/{google,meta,tiktok,x} with no
 * redirects — do not reintroduce locators or `gotoSection` values for them.
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

  constructor(page: Page) {
    this.page = page;

    this.mainContent = page.locator('main, [data-testid="main-content"]');
    this.sidebar = sidebarLocator(page);

    this.loadingSpinner = page.locator(
      '[data-testid="loading"], .loading, .spinner',
    );
    this.skeleton = page.locator('[data-testid="skeleton"], .skeleton');
  }

  async goto(path = this.url): Promise<void> {
    await this.page.goto(path);
    await this.waitForPageLoad();
  }

  async gotoSection(section: 'overview' | 'ads'): Promise<void> {
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
