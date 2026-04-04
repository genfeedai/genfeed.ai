import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';

/**
 * Page Object Model for the Settings Page
 *
 * Provides an abstraction layer for interacting with user and billing settings.
 *
 * @module settings.page
 */
export class SettingsPage {
  readonly page: Page;
  readonly url = '/settings';

  // Main layout
  readonly mainContent: Locator;
  readonly settingsNav: Locator;

  // Navigation tabs/links
  readonly profileTab: Locator;
  readonly billingTab: Locator;
  readonly notificationsTab: Locator;
  readonly securityTab: Locator;
  readonly apiKeysTab: Locator;
  readonly organizationTab: Locator;

  // Profile settings
  readonly profileSection: Locator;
  readonly firstNameInput: Locator;
  readonly lastNameInput: Locator;
  readonly emailInput: Locator;
  readonly bioInput: Locator;
  readonly avatarUpload: Locator;
  readonly avatarImage: Locator;
  readonly saveProfileButton: Locator;

  // Billing settings
  readonly billingSection: Locator;
  readonly currentPlanDisplay: Locator;
  readonly upgradeButton: Locator;
  readonly cancelSubscriptionButton: Locator;
  readonly paymentMethodCard: Locator;
  readonly addPaymentMethodButton: Locator;
  readonly invoicesSection: Locator;
  readonly invoiceItem: Locator;
  readonly creditBalance: Locator;
  readonly buyCreditsButton: Locator;

  // Notification settings
  readonly notificationsSection: Locator;
  readonly emailNotificationsToggle: Locator;
  readonly pushNotificationsToggle: Locator;
  readonly marketingEmailsToggle: Locator;

  // Security settings
  readonly securitySection: Locator;
  readonly changePasswordButton: Locator;
  readonly twoFactorToggle: Locator;
  readonly sessionsSection: Locator;
  readonly revokeAllSessionsButton: Locator;

  // API Keys settings
  readonly apiKeysSection: Locator;
  readonly apiKeyInput: Locator;
  readonly generateApiKeyButton: Locator;
  readonly apiKeyList: Locator;
  readonly apiKeyItem: Locator;
  readonly copyApiKeyButton: Locator;
  readonly deleteApiKeyButton: Locator;

  // Organization identity defaults
  readonly orgIdentityCard: Locator;
  readonly orgDefaultAvatarTrigger: Locator;
  readonly saveOrgIdentityButton: Locator;
  readonly browseAvatarLibraryButton: Locator;

  // Common elements
  readonly successMessage: Locator;
  readonly errorMessage: Locator;
  readonly loadingSpinner: Locator;
  readonly confirmDialog: Locator;

  constructor(page: Page) {
    this.page = page;

    // Layout
    this.mainContent = page.locator('main, [data-testid="main-content"]');
    this.settingsNav = page.locator(
      '[data-testid="settings-nav"], nav[aria-label="Settings"]',
    );

    // Navigation tabs
    this.profileTab = page.locator(
      'a[href*="profile"], button:has-text("Profile"), [data-testid="profile-tab"]',
    );
    this.billingTab = page.locator(
      'a[href*="billing"], button:has-text("Billing"), [data-testid="billing-tab"]',
    );
    this.notificationsTab = page.locator(
      'a[href*="notifications"], button:has-text("Notifications"), [data-testid="notifications-tab"]',
    );
    this.securityTab = page.locator(
      'a[href*="security"], button:has-text("Security"), [data-testid="security-tab"]',
    );
    this.apiKeysTab = page.locator(
      'a[href*="api"], button:has-text("API"), [data-testid="api-keys-tab"]',
    );
    this.organizationTab = page.locator(
      'a[href*="organization"], button:has-text("Organization"), [data-testid="organization-tab"]',
    );

    // Profile form
    this.profileSection = page.locator('[data-testid="profile-section"]');
    this.firstNameInput = page.locator(
      'input[name="firstName"], input[name="first_name"], [data-testid="first-name-input"]',
    );
    this.lastNameInput = page.locator(
      'input[name="lastName"], input[name="last_name"], [data-testid="last-name-input"]',
    );
    this.emailInput = page.locator(
      'input[name="email"], input[type="email"], [data-testid="email-input"]',
    );
    this.bioInput = page.locator(
      'textarea[name="bio"], [data-testid="bio-input"]',
    );
    this.avatarUpload = page.locator(
      'input[type="file"][accept*="image"], [data-testid="avatar-upload"]',
    );
    this.avatarImage = page.locator(
      '[data-testid="avatar-image"], img[alt*="avatar" i], img[alt*="profile" i]',
    );
    this.saveProfileButton = page.locator(
      'button:has-text("Save"), button:has-text("Update Profile"), [data-testid="save-profile"]',
    );

    // Billing section
    this.billingSection = page.locator('[data-testid="billing-section"]');
    this.currentPlanDisplay = page.locator(
      '[data-testid="current-plan"], [data-plan]',
    );
    this.upgradeButton = page.locator(
      'button:has-text("Upgrade"), a:has-text("Upgrade"), [data-testid="upgrade-button"]',
    );
    this.cancelSubscriptionButton = page.locator(
      'button:has-text("Cancel"), [data-testid="cancel-subscription"]',
    );
    this.paymentMethodCard = page.locator(
      '[data-testid="payment-method"], [data-payment-card]',
    );
    this.addPaymentMethodButton = page.locator(
      'button:has-text("Add Payment"), [data-testid="add-payment-method"]',
    );
    this.invoicesSection = page.locator('[data-testid="invoices-section"]');
    this.invoiceItem = page.locator(
      '[data-testid="invoice-item"], [data-invoice]',
    );
    this.creditBalance = page.locator(
      '[data-testid="credit-balance"], [data-credits]',
    );
    this.buyCreditsButton = page.locator(
      'button:has-text("Buy Credits"), [data-testid="buy-credits"]',
    );

    // Notifications section
    this.notificationsSection = page.locator(
      '[data-testid="notifications-section"]',
    );
    this.emailNotificationsToggle = page.locator(
      '[data-testid="email-notifications"], input[name*="email"]',
    );
    this.pushNotificationsToggle = page.locator(
      '[data-testid="push-notifications"], input[name*="push"]',
    );
    this.marketingEmailsToggle = page.locator(
      '[data-testid="marketing-emails"], input[name*="marketing"]',
    );

    // Security section
    this.securitySection = page.locator('[data-testid="security-section"]');
    this.changePasswordButton = page.locator(
      'button:has-text("Change Password"), [data-testid="change-password"]',
    );
    this.twoFactorToggle = page.locator(
      '[data-testid="two-factor"], input[name*="2fa"], input[name*="twoFactor"]',
    );
    this.sessionsSection = page.locator('[data-testid="sessions-section"]');
    this.revokeAllSessionsButton = page.locator(
      'button:has-text("Revoke All"), [data-testid="revoke-sessions"]',
    );

    // API Keys section
    this.apiKeysSection = page.locator('[data-testid="api-keys-section"]');
    this.apiKeyInput = page.locator(
      'input[name="apiKeyName"], [data-testid="api-key-name-input"]',
    );
    this.generateApiKeyButton = page.locator(
      'button:has-text("Generate"), [data-testid="generate-api-key"]',
    );
    this.apiKeyList = page.locator('[data-testid="api-key-list"]');
    this.apiKeyItem = page.locator('[data-testid="api-key-item"]');
    this.copyApiKeyButton = page.locator(
      'button[aria-label*="copy" i], [data-testid="copy-api-key"]',
    );
    this.deleteApiKeyButton = page.locator(
      'button[aria-label*="delete" i], [data-testid="delete-api-key"]',
    );

    this.orgIdentityCard = page.locator(
      '[data-testid="org-default-avatar-trigger"]',
    );
    this.orgDefaultAvatarTrigger = page.locator(
      '[data-testid="org-default-avatar-trigger"]',
    );
    this.saveOrgIdentityButton = page.locator(
      '[data-testid="save-org-identity"]',
    );
    this.browseAvatarLibraryButton = page.locator(
      '[data-testid="browse-avatar-library"]',
    );

    // Common elements
    this.successMessage = page.locator(
      '[data-testid="success-message"], [role="alert"]:has-text("success"), .toast-success',
    );
    this.errorMessage = page.locator(
      '[data-testid="error-message"], [role="alert"]:has-text("error"), .toast-error',
    );
    this.loadingSpinner = page.locator(
      '[data-testid="loading"], .loading, .spinner',
    );
    this.confirmDialog = page.locator('[role="alertdialog"], [role="dialog"]');
  }

  /**
   * Navigate to the settings page
   */
  async goto(): Promise<void> {
    await this.page.goto(this.url);
    await this.waitForPageLoad();
  }

  /**
   * Navigate to a specific settings section
   */
  async gotoSection(
    section: 'profile' | 'billing' | 'notifications' | 'security' | 'api',
  ): Promise<void> {
    await this.page.goto(`${this.url}/${section}`);
    await this.waitForPageLoad();
  }

  /**
   * Wait for the settings page to fully load
   */
  async waitForPageLoad(): Promise<void> {
    await this.page.waitForLoadState('domcontentloaded');
    await this.mainContent
      .waitFor({ state: 'visible', timeout: 15000 })
      .catch(() => {});

    // Wait for loading to complete
    const spinner = this.loadingSpinner;
    const isSpinnerVisible = await spinner.isVisible().catch(() => false);
    if (isSpinnerVisible) {
      await spinner.waitFor({ state: 'hidden', timeout: 30000 });
    }
  }

  /**
   * Check if the settings page is displayed
   */
  async isDisplayed(): Promise<boolean> {
    const url = this.page.url();
    return url.includes('/settings');
  }

  // Navigation methods
  async goToProfile(): Promise<void> {
    await this.profileTab.click();
    await this.page.waitForLoadState('domcontentloaded');
  }

  async goToBilling(): Promise<void> {
    await this.billingTab.click();
    await this.page.waitForLoadState('domcontentloaded');
  }

  async goToOrganization(): Promise<void> {
    await this.page.goto('/settings/organization', {
      timeout: 60000,
      waitUntil: 'domcontentloaded',
    });
    await this.waitForPageLoad();
  }

  async goToNotifications(): Promise<void> {
    await this.notificationsTab.click();
    await this.page.waitForLoadState('domcontentloaded');
  }

  async goToSecurity(): Promise<void> {
    await this.securityTab.click();
    await this.page.waitForLoadState('domcontentloaded');
  }

  async goToApiKeys(): Promise<void> {
    await this.apiKeysTab.click();
    await this.page.waitForLoadState('domcontentloaded');
  }

  // Profile methods
  async updateProfile(data: {
    firstName?: string;
    lastName?: string;
    bio?: string;
  }): Promise<void> {
    if (data.firstName) {
      await this.firstNameInput.fill(data.firstName);
    }
    if (data.lastName) {
      await this.lastNameInput.fill(data.lastName);
    }
    if (data.bio) {
      await this.bioInput.fill(data.bio);
    }

    await this.saveProfileButton.click();
    await this.page.waitForLoadState('domcontentloaded');
  }

  async uploadAvatar(filePath: string): Promise<void> {
    await this.avatarUpload.setInputFiles(filePath);
    await this.page.waitForLoadState('domcontentloaded');
  }

  // Billing methods
  async getCurrentPlan(): Promise<string> {
    return (await this.currentPlanDisplay.textContent()) || '';
  }

  async getCreditBalance(): Promise<string> {
    return (await this.creditBalance.textContent()) || '';
  }

  async clickUpgrade(): Promise<void> {
    await this.upgradeButton.click();
  }

  async getInvoiceCount(): Promise<number> {
    return await this.invoiceItem.count();
  }

  // Notification methods
  async toggleEmailNotifications(): Promise<void> {
    await this.emailNotificationsToggle.click();
  }

  async togglePushNotifications(): Promise<void> {
    await this.pushNotificationsToggle.click();
  }

  async toggleMarketingEmails(): Promise<void> {
    await this.marketingEmailsToggle.click();
  }

  // Security methods
  async clickChangePassword(): Promise<void> {
    await this.changePasswordButton.click();
  }

  async toggle2FA(): Promise<void> {
    await this.twoFactorToggle.click();
  }

  async revokeAllSessions(): Promise<void> {
    await this.revokeAllSessionsButton.click();

    // Handle confirmation dialog
    const confirmButton = this.confirmDialog.locator(
      'button:has-text("Confirm")',
    );
    await confirmButton.click();
  }

  // API Keys methods
  async generateApiKey(name: string): Promise<void> {
    await this.apiKeyInput.fill(name);
    await this.generateApiKeyButton.click();
    await this.page.waitForLoadState('domcontentloaded');
  }

  async getApiKeyCount(): Promise<number> {
    return await this.apiKeyItem.count();
  }

  async copyApiKey(index = 0): Promise<void> {
    await this.apiKeyItem.nth(index).locator(this.copyApiKeyButton).click();
  }

  async deleteApiKey(index = 0): Promise<void> {
    await this.apiKeyItem.nth(index).locator(this.deleteApiKeyButton).click();

    // Handle confirmation
    const confirmButton = this.confirmDialog.locator(
      'button:has-text("Delete")',
    );
    await confirmButton.click();
  }

  // Assertions
  async assertProfileSaved(): Promise<void> {
    await expect(this.successMessage).toBeVisible();
  }

  async assertError(): Promise<void> {
    await expect(this.errorMessage).toBeVisible();
  }

  async assertPlanIs(planName: string): Promise<void> {
    await expect(this.currentPlanDisplay).toContainText(planName);
  }

  async assertHasPaymentMethod(): Promise<void> {
    await expect(this.paymentMethodCard).toBeVisible();
  }

  async assertApiKeyGenerated(): Promise<void> {
    await expect(this.successMessage).toBeVisible();
    const count = await this.getApiKeyCount();
    expect(count).toBeGreaterThan(0);
  }

  /**
   * Get form validation errors
   */
  async getValidationErrors(): Promise<string[]> {
    const errors = await this.page
      .locator('.form-error, [data-error], [aria-invalid="true"]')
      .all();
    const errorTexts: string[] = [];

    for (const error of errors) {
      const text = await error.textContent();
      if (text) {
        errorTexts.push(text);
      }
    }

    return errorTexts;
  }

  /**
   * Check if a notification toggle is enabled
   */
  async isNotificationEnabled(
    type: 'email' | 'push' | 'marketing',
  ): Promise<boolean> {
    const toggleMap = {
      email: this.emailNotificationsToggle,
      marketing: this.marketingEmailsToggle,
      push: this.pushNotificationsToggle,
    };

    return await toggleMap[type].isChecked();
  }
}
