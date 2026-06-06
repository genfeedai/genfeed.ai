import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';

/**
 * Page Object Model for the Brands Page
 *
 * Provides an abstraction layer for interacting with
 * brand management: list, detail, creation, connected accounts.
 *
 * @module brands.page
 */
export class BrandsPage {
  readonly page: Page;
  readonly url = '/settings/brands';

  // Main layout
  readonly mainContent: Locator;

  // Brand list
  readonly brandList: Locator;
  readonly brandCard: Locator;
  readonly emptyState: Locator;

  // Brand creation
  readonly createBrandButton: Locator;
  readonly brandNameInput: Locator;
  readonly brandDescriptionInput: Locator;
  readonly saveBrandButton: Locator;

  // Brand detail
  readonly brandTitle: Locator;
  readonly brandDescription: Locator;
  readonly brandSettings: Locator;
  readonly editBrandButton: Locator;
  readonly deleteBrandButton: Locator;
  readonly brandIdentityCard: Locator;
  readonly brandDefaultAvatarTrigger: Locator;
  readonly saveBrandIdentityButton: Locator;

  // Connected accounts
  readonly connectedAccounts: Locator;
  readonly connectAccountButton: Locator;
  readonly accountCard: Locator;

  // Loading
  readonly loadingSpinner: Locator;
  readonly skeleton: Locator;

  // Common
  readonly successMessage: Locator;
  readonly errorMessage: Locator;
  readonly confirmDialog: Locator;

  constructor(page: Page) {
    this.page = page;

    this.mainContent = page.locator('main, [data-testid="main-content"]');

    // Brand list
    this.brandList = page.locator(
      '[data-testid="brands-list"],' +
        ' [data-testid="brand-grid"],' +
        ' .brands-container',
    );
    this.brandCard = page.locator(
      '[data-testid="brand-card"],' +
        ' [data-testid="brand-item"],' +
        ' .brand-card',
    );
    this.emptyState = page.locator(
      '[data-testid="empty-state"],' +
        ' [data-testid="no-brands"],' +
        ' .empty-state',
    );

    // Creation
    this.createBrandButton = page.locator(
      '[data-testid="create-brand"],' +
        ' button:has-text("Create Brand"),' +
        ' button:has-text("Add Brand"),' +
        ' button:has-text("New Brand")',
    );
    this.brandNameInput = page.locator(
      'input[name="name"],' +
        ' input[name="brandName"],' +
        ' [data-testid="brand-name-input"]',
    );
    this.brandDescriptionInput = page.locator(
      'textarea[name="description"],' +
        ' [data-testid="brand-description-input"]',
    );
    this.saveBrandButton = page.locator(
      'button:has-text("Save"),' +
        ' button:has-text("Create"),' +
        ' [data-testid="save-brand"]',
    );

    // Detail
    this.brandTitle = page.locator('[data-testid="brand-title"], h1, h2');
    this.brandDescription = page.locator('[data-testid="brand-description"]');
    this.brandSettings = page.locator(
      '[data-testid="brand-settings"],' + ' .brand-settings',
    );
    this.editBrandButton = page.locator(
      'button:has-text("Edit"),' + ' [data-testid="edit-brand"]',
    );
    this.deleteBrandButton = page.locator(
      'button:has-text("Delete"),' + ' [data-testid="delete-brand"]',
    );
    this.brandIdentityCard = page.locator(
      '[data-testid="brand-default-avatar-trigger"]',
    );
    this.brandDefaultAvatarTrigger = page.locator(
      '[data-testid="brand-default-avatar-trigger"]',
    );
    this.saveBrandIdentityButton = page.locator(
      '[data-testid="save-brand-identity"]',
    );

    // Connected accounts
    this.connectedAccounts = page.locator(
      '[data-testid="connected-accounts"],' +
        ' [data-testid="social-accounts"],' +
        ' .connected-accounts',
    );
    this.connectAccountButton = page.locator(
      'button:has-text("Connect"),' + ' [data-testid="connect-account"]',
    );
    this.accountCard = page.locator(
      '[data-testid="account-card"],' +
        ' [data-testid="social-account"],' +
        ' .account-card',
    );

    // Loading
    this.loadingSpinner = page.locator(
      '[data-testid="loading"], .loading, .spinner',
    );
    this.skeleton = page.locator('[data-testid="skeleton"], .skeleton');

    // Common
    this.successMessage = page.locator(
      '[data-testid="success-message"],' +
        ' [role="alert"]:has-text("success"),' +
        ' .toast-success',
    );
    this.errorMessage = page.locator(
      '[data-testid="error-message"],' +
        ' [role="alert"]:has-text("error"),' +
        ' .toast-error',
    );
    this.confirmDialog = page.locator('[role="alertdialog"], [role="dialog"]');
  }

  async goto(): Promise<void> {
    await this.page.goto(this.url);
    await this.waitForPageLoad();
  }

  async gotoBrandDetail(brandId: string): Promise<void> {
    await this.page.goto(`/settings/brands/${brandId}`, {
      timeout: 60000,
      waitUntil: 'domcontentloaded',
    });
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

  async getBrandCount(): Promise<number> {
    return await this.brandCard.count();
  }

  async clickBrand(index = 0): Promise<void> {
    await this.brandCard.nth(index).click();
    await this.page.waitForLoadState('domcontentloaded');
  }

  async createBrand(name: string, description?: string): Promise<void> {
    await this.createBrandButton.click();
    await this.brandNameInput.fill(name);
    if (description) {
      await this.brandDescriptionInput.fill(description);
    }
    await this.saveBrandButton.click();
    await this.page.waitForLoadState('domcontentloaded');
  }

  async getConnectedAccountCount(): Promise<number> {
    return await this.accountCard.count();
  }

  async isDisplayed(): Promise<boolean> {
    return this.page.url().includes('/settings/brands');
  }

  async assertBrandsVisible(minCount = 1): Promise<void> {
    const count = await this.getBrandCount();
    expect(count).toBeGreaterThanOrEqual(minCount);
  }

  async assertEmptyState(): Promise<void> {
    await expect(this.emptyState).toBeVisible();
  }
}
