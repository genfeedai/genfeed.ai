import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';

/**
 * Page Object Model for the Compose Pages (Post, Article, Newsletter)
 *
 * Provides an abstraction layer for interacting with content composition flows.
 *
 * @module compose.page
 */
export class ComposePage {
  readonly page: Page;

  // Layout
  readonly mainContent: Locator;
  readonly loadingIndicator: Locator;
  readonly pageContainer: Locator;

  // Navigation
  readonly composePostLink: Locator;
  readonly composeArticleLink: Locator;
  readonly composeNewsletterLink: Locator;

  constructor(page: Page) {
    this.page = page;

    // Layout
    this.mainContent = page.locator('main, [data-testid="main-content"]');
    this.loadingIndicator = page.locator(
      '[data-testid="loading"], .loading, .spinner',
    );
    this.pageContainer = page.locator(
      '[data-testid="compose-container"], [data-testid="container"]',
    );

    // Navigation links
    this.composePostLink = page.locator('a[href*="/compose/post"]');
    this.composeArticleLink = page.locator('a[href*="/compose/article"]');
    this.composeNewsletterLink = page.locator('a[href*="/compose/newsletter"]');
  }

  async gotoPost(): Promise<void> {
    await this.page.goto('/compose/post');
    await this.waitForPageLoad();
  }

  async gotoArticle(): Promise<void> {
    await this.page.goto('/compose/article');
    await this.waitForPageLoad();
  }

  async gotoNewsletter(): Promise<void> {
    await this.page.goto('/compose/newsletter');
    await this.waitForPageLoad();
  }

  async waitForPageLoad(): Promise<void> {
    await this.page.waitForLoadState('domcontentloaded');

    await this.mainContent
      .waitFor({ state: 'visible', timeout: 15000 })
      .catch(() => {
        // Some pages may use different structure
      });

    const isSpinnerVisible = await this.loadingIndicator
      .isVisible()
      .catch(() => false);
    if (isSpinnerVisible) {
      await this.loadingIndicator.waitFor({ state: 'hidden', timeout: 30000 });
    }
  }

  async assertOnPostPage(): Promise<void> {
    await expect(this.page).toHaveURL(/compose\/post/);
  }

  async assertOnArticlePage(): Promise<void> {
    await expect(this.page).toHaveURL(/compose\/article/);
  }

  async assertOnNewsletterPage(): Promise<void> {
    await expect(this.page).toHaveURL(/compose\/newsletter/);
  }

  async assertPageLoaded(): Promise<void> {
    await expect(this.mainContent).toBeVisible();
  }
}
