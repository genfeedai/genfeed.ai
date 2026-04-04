import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';

/**
 * Page Object Model for the Marketplace
 *
 * Covers browse, search, listing detail, checkout, library,
 * and leaderboard flows.
 *
 * @module marketplace.page
 */
export class MarketplacePage {
  readonly page: Page;

  // Browse / category pages
  readonly mainContent: Locator;
  readonly heading: Locator;
  readonly listingCards: Locator;
  readonly searchInput: Locator;

  // Listing detail
  readonly listingTitle: Locator;
  readonly listingPrice: Locator;
  readonly purchaseButton: Locator;
  readonly downloadButton: Locator;
  readonly backLink: Locator;
  readonly sellerInfo: Locator;
  readonly ratingDisplay: Locator;

  // Checkout
  readonly checkoutSuccessIcon: Locator;
  readonly checkoutSuccessHeading: Locator;
  readonly checkoutCancelIcon: Locator;
  readonly checkoutCancelHeading: Locator;
  readonly orderIdDisplay: Locator;

  // Library
  readonly libraryHeading: Locator;
  readonly libraryItems: Locator;
  readonly libraryFilterAll: Locator;
  readonly libraryFilterWorkflow: Locator;
  readonly libraryFilterPrompt: Locator;
  readonly librarySearchInput: Locator;
  readonly libraryEmptyState: Locator;

  // Loading
  readonly loadingSpinner: Locator;
  readonly skeleton: Locator;

  constructor(page: Page) {
    this.page = page;

    // Layout
    this.mainContent = page.locator('main, [data-testid="main-content"]');
    this.heading = page.getByRole('heading').first();
    this.listingCards = page.locator(
      '[data-testid="listing-card"], .listing-card, article',
    );
    this.searchInput = page.locator(
      'input[placeholder*="Search" i], ' +
        'input[placeholder*="search" i], ' +
        '[data-testid="search-input"]',
    );

    // Listing detail
    this.listingTitle = page.locator('h1, [data-testid="listing-title"]');
    this.listingPrice = page.locator(
      '[data-testid="listing-price"], ' + '.price, ' + 'text=/\\$\\d/',
    );
    this.purchaseButton = page.locator(
      'button:has-text("Buy"), ' +
        'button:has-text("Purchase"), ' +
        'button:has-text("Get"), ' +
        'button:has-text("Claim"), ' +
        'button:has-text("Install"), ' +
        '[data-testid="purchase-button"]',
    );
    this.downloadButton = page.locator(
      'button:has-text("Download"), ' + '[data-testid="download-button"]',
    );
    this.backLink = page.locator(
      'a:has-text("Back"), [data-testid="back-link"]',
    );
    this.sellerInfo = page.locator('[data-testid="seller-info"], .seller-info');
    this.ratingDisplay = page.locator('[data-testid="rating"], .rating');

    // Checkout success
    this.checkoutSuccessIcon = page.locator(
      '.text-success, [data-testid="success-icon"]',
    );
    this.checkoutSuccessHeading = page.getByRole('heading', {
      name: /payment successful/i,
    });
    this.checkoutCancelIcon = page.locator(
      '.text-warning, [data-testid="cancel-icon"]',
    );
    this.checkoutCancelHeading = page.getByRole('heading', {
      name: /payment cancelled/i,
    });
    this.orderIdDisplay = page.locator('.font-mono');

    // Library
    this.libraryHeading = page.getByRole('heading', {
      name: /my library/i,
    });
    this.libraryItems = page.locator(
      '[data-testid="library-item"], ' +
        '.library-item, ' +
        'article, ' +
        '[data-testid="purchase-card"]',
    );
    this.libraryFilterAll = page.locator(
      'button:has-text("All"), [data-testid="filter-all"]',
    );
    this.libraryFilterWorkflow = page.locator(
      'button:has-text("Workflow"), [data-testid="filter-workflow"]',
    );
    this.libraryFilterPrompt = page.locator(
      'button:has-text("Prompt"), [data-testid="filter-prompt"]',
    );
    this.librarySearchInput = page.locator(
      'input[placeholder*="Search" i], ' + '[data-testid="library-search"]',
    );
    this.libraryEmptyState = page.locator(
      '[data-testid="empty-state"], .empty-state',
    );

    // Loading
    this.loadingSpinner = page.locator(
      '[data-testid="loading"], .loading, .spinner',
    );
    this.skeleton = page.locator('[data-testid="skeleton"], .skeleton');
  }

  // ---------- Navigation ----------

  async gotoHome(): Promise<void> {
    await this.page.goto('/', { waitUntil: 'domcontentloaded' });
    await this.waitForPageLoad();
  }

  async gotoCategory(
    category:
      | 'skills'
      | 'workflows'
      | 'presets'
      | 'prompts'
      | 'images'
      | 'videos'
      | 'musics'
      | 'posts'
      | 'free',
  ): Promise<void> {
    await this.page.goto(`/${category}`, {
      waitUntil: 'domcontentloaded',
    });
    await this.waitForPageLoad();
  }

  async gotoListingDetail(
    sellerSlug: string,
    listingSlug: string,
  ): Promise<void> {
    await this.page.goto(`/${sellerSlug}/${listingSlug}`, {
      waitUntil: 'domcontentloaded',
    });
    await this.waitForPageLoad();
  }

  async gotoCheckoutSuccess(sessionId: string): Promise<void> {
    await this.page.goto(`/checkout/success?session_id=${sessionId}`, {
      waitUntil: 'domcontentloaded',
    });
    await this.waitForPageLoad();
  }

  async gotoCheckoutCancel(): Promise<void> {
    await this.page.goto('/checkout/cancel', {
      waitUntil: 'domcontentloaded',
    });
    await this.waitForPageLoad();
  }

  async gotoLibrary(): Promise<void> {
    await this.page.goto('/library', {
      waitUntil: 'domcontentloaded',
    });
    await this.waitForPageLoad();
  }

  async gotoLeaderboard(): Promise<void> {
    await this.page.goto('/leaderboard', {
      waitUntil: 'domcontentloaded',
    });
    await this.waitForPageLoad();
  }

  async gotoSearch(query?: string): Promise<void> {
    const url = query ? `/search?q=${encodeURIComponent(query)}` : '/search';
    await this.page.goto(url, {
      waitUntil: 'domcontentloaded',
    });
    await this.waitForPageLoad();
  }

  // ---------- Actions ----------

  async search(query: string): Promise<void> {
    await this.searchInput.waitFor({
      state: 'visible',
      timeout: 5000,
    });
    await this.searchInput.fill(query);
    await this.searchInput.press('Enter');
  }

  async clickListing(index = 0): Promise<void> {
    await this.listingCards.nth(index).click();
  }

  async clickPurchase(): Promise<void> {
    await this.purchaseButton.first().click();
  }

  async clickDownload(): Promise<void> {
    await this.downloadButton.first().click();
  }

  async filterLibrary(type: 'all' | 'workflow' | 'prompt'): Promise<void> {
    const filterMap = {
      all: this.libraryFilterAll,
      prompt: this.libraryFilterPrompt,
      workflow: this.libraryFilterWorkflow,
    };
    await filterMap[type].click();
  }

  // ---------- Waits ----------

  async waitForPageLoad(): Promise<void> {
    await this.page.waitForLoadState('domcontentloaded');
    const spinner = this.loadingSpinner;
    const visible = await spinner.isVisible().catch(() => false);
    if (visible) {
      await spinner
        .waitFor({ state: 'hidden', timeout: 15000 })
        .catch(() => {});
    }
  }

  async waitForListings(minCount = 1): Promise<void> {
    await expect(this.listingCards.first()).toBeVisible({
      timeout: 10000,
    });
    const count = await this.listingCards.count();
    expect(count).toBeGreaterThanOrEqual(minCount);
  }

  // ---------- Assertions ----------

  async assertPageVisible(): Promise<void> {
    await expect(this.mainContent).toBeVisible({ timeout: 15000 });
  }

  async assertHeadingVisible(): Promise<void> {
    await expect(this.heading).toBeVisible({ timeout: 10000 });
  }

  async assertCheckoutSuccess(): Promise<void> {
    await expect(this.checkoutSuccessHeading).toBeVisible({
      timeout: 10000,
    });
  }

  async assertCheckoutCancel(): Promise<void> {
    await expect(this.checkoutCancelHeading).toBeVisible({
      timeout: 10000,
    });
  }

  async assertLibraryVisible(): Promise<void> {
    await expect(this.libraryHeading).toBeVisible({
      timeout: 10000,
    });
  }

  async assertListingDetailVisible(): Promise<void> {
    await expect(this.listingTitle).toBeVisible({
      timeout: 10000,
    });
  }

  async getListingCount(): Promise<number> {
    return await this.listingCards.count();
  }

  async getLibraryItemCount(): Promise<number> {
    return await this.libraryItems.count();
  }
}
