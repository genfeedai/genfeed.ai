import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';

/**
 * Page Object Model for the Onboarding Flow
 *
 * Covers the 6-step wizard (account-type → profile → brand → preferences → platforms → plan)
 * plus the success screen. Follows the existing LoginPage POM pattern.
 *
 * @module onboarding.page
 */

type AccountType = 'Creator' | 'Business' | 'Agency';
type ContentPreference = 'Images' | 'Videos' | 'Avatars' | 'Music';

const STEP_PATHS = [
  'account-type',
  'profile',
  'brand',
  'preferences',
  'platforms',
  'plan',
] as const;

export class OnboardingPage {
  readonly page: Page;

  // Shared elements
  readonly stepBadge: Locator;
  readonly headline: Locator;
  readonly backButton: Locator;
  readonly continueButton: Locator;
  readonly skipButton: Locator;
  readonly loadingSpinner: Locator;

  // Step 1 — Account Type
  readonly typeCards: Locator;

  // Step 2 — Profile
  readonly firstNameInput: Locator;
  readonly lastNameInput: Locator;
  readonly handleInput: Locator;
  readonly avatarFileInput: Locator;
  readonly profileSubmitButton: Locator;

  // Step 3 — Brand
  readonly brandNameInput: Locator;
  readonly websiteUrlInput: Locator;
  readonly scanButton: Locator;
  readonly scrapedPreview: Locator;

  // Step 4 — Preferences
  readonly prefCards: Locator;

  // Step 5 — Platforms
  readonly platformCards: Locator;

  // Step 6 — Plan
  readonly planCards: Locator;
  readonly bookACallLink: Locator;
  readonly exploreButton: Locator;

  // Success
  readonly successIcon: Locator;
  readonly goToStudioButton: Locator;

  constructor(page: Page) {
    this.page = page;

    // Shared
    this.stepBadge = page.locator('.step-badge');
    this.headline = page.locator('h1');
    this.backButton = page.locator('button', { hasText: 'Back' });
    this.continueButton = page.locator('button', { hasText: 'Continue' });
    this.skipButton = page.locator('button', { hasText: 'Skip for now' });
    this.loadingSpinner = page.locator('.animate-spin');

    // Step 1
    this.typeCards = page.locator('.type-card');

    // Step 2
    this.firstNameInput = page.locator('input[placeholder="John"]');
    this.lastNameInput = page.locator('input[placeholder="Doe"]');
    this.handleInput = page.locator('input[placeholder="johndoe"]');
    this.avatarFileInput = page.locator('input[type="file"]');
    this.profileSubmitButton = page.locator('button[type="submit"]');

    // Step 3
    this.brandNameInput = page.locator('input[placeholder="Your Brand"]');
    this.websiteUrlInput = page.locator('input[type="url"]');
    this.scanButton = page.locator('button', { hasText: 'Scan' });
    this.scrapedPreview = page.locator('text=Brand data extracted');

    // Step 4
    this.prefCards = page.locator('.pref-card');

    // Step 5
    this.platformCards = page.locator('.platform-card');

    // Step 6
    this.planCards = page.locator('.plan-card');
    this.bookACallLink = page.locator('a', { hasText: 'Book a Call' });
    this.exploreButton = page.locator('button', {
      hasText: 'Skip for now',
    });

    // Success
    this.successIcon = page.locator('.success-icon');
    this.goToStudioButton = page.locator('button', {
      hasText: /Enter Workspace|Go to Studio/,
    });
  }

  /**
   * Navigate to an onboarding step. Defaults to 'account-type'.
   */
  async goto(
    step: (typeof STEP_PATHS)[number] | 'success' = 'account-type',
  ): Promise<void> {
    await this.page.goto(`/onboarding/${step}`, {
      timeout: 120000,
      waitUntil: 'domcontentloaded',
    });
  }

  /**
   * Wait for a specific step number to be visible in the badge.
   */
  async waitForStep(stepNumber: number): Promise<void> {
    await this.stepBadge.waitFor({ state: 'visible', timeout: 30000 });
    await expect(this.stepBadge).toContainText(`Step ${stepNumber} of 6`);
  }

  /**
   * Assert the URL and badge match the expected step.
   */
  async assertOnStep(stepNumber: number): Promise<void> {
    const stepPath = STEP_PATHS[stepNumber - 1];
    await expect(this.page).toHaveURL(new RegExp(`/onboarding/${stepPath}`));
    await this.waitForStep(stepNumber);
  }

  // ---------------------------------------------------------------------------
  // Step 1 — Account Type
  // ---------------------------------------------------------------------------

  /**
   * Select an account type card (Creator, Business, or Agency).
   */
  async selectAccountType(type: AccountType): Promise<void> {
    const card = this.typeCards.filter({ hasText: type });
    await card.click();
  }

  // ---------------------------------------------------------------------------
  // Step 2 — Profile
  // ---------------------------------------------------------------------------

  /**
   * Fill the profile form and submit.
   */
  async fillProfile(data: {
    firstName: string;
    lastName?: string;
    handle: string;
  }): Promise<void> {
    await this.firstNameInput.fill(data.firstName);
    if (data.lastName) {
      await this.lastNameInput.fill(data.lastName);
    }
    await this.handleInput.fill(data.handle);
    await this.profileSubmitButton.click();
  }

  // ---------------------------------------------------------------------------
  // Step 3 — Brand
  // ---------------------------------------------------------------------------

  /**
   * Fill brand name.
   */
  async fillBrandName(name: string): Promise<void> {
    await this.brandNameInput.fill(name);
  }

  /**
   * Fill website URL and trigger scan.
   */
  async fillAndScanWebsite(url: string): Promise<void> {
    await this.websiteUrlInput.fill(url);
    await this.scanButton.click();
  }

  // ---------------------------------------------------------------------------
  // Step 4 — Preferences
  // ---------------------------------------------------------------------------

  /**
   * Select content type preferences by title.
   */
  async selectPreferences(types: ContentPreference[]): Promise<void> {
    for (const type of types) {
      const card = this.prefCards.filter({ hasText: type });
      await card.click();
    }
  }

  // ---------------------------------------------------------------------------
  // Step 5 — Platforms
  // ---------------------------------------------------------------------------

  /**
   * Click the Connect button for a specific platform.
   */
  async connectPlatform(platformName: string): Promise<void> {
    const card = this.platformCards.filter({ hasText: platformName });
    await card.locator('button', { hasText: 'Connect' }).click();
  }

  // ---------------------------------------------------------------------------
  // Step 6 — Plan
  // ---------------------------------------------------------------------------

  /**
   * Click Subscribe on a specific plan card.
   */
  async subscribeToPlan(planName: string): Promise<void> {
    const card = this.planCards.filter({ hasText: planName });
    await card.locator('button', { hasText: 'Subscribe' }).click();
  }

  /**
   * Click the "Skip for now — explore the platform free" link on the plan step.
   */
  async clickExplore(): Promise<void> {
    await this.page.locator('button', { hasText: 'Skip for now' }).click();
  }

  // ---------------------------------------------------------------------------
  // Shared navigation
  // ---------------------------------------------------------------------------

  /**
   * Click the Continue button.
   */
  async clickContinue(): Promise<void> {
    await this.continueButton.click();
  }

  /**
   * Click the Back button.
   */
  async clickBack(): Promise<void> {
    await this.backButton.click();
  }

  /**
   * Click "Skip for now" (available on brand, preferences, platforms steps).
   */
  async skipStep(): Promise<void> {
    await this.skipButton.first().click();
  }

  // ---------------------------------------------------------------------------
  // Success
  // ---------------------------------------------------------------------------

  /**
   * Assert that the success page is fully visible.
   */
  async assertSuccess(): Promise<void> {
    await expect(this.page).toHaveURL(/\/onboarding\/success/);
    await this.successIcon.waitFor({ state: 'visible', timeout: 30000 });
    await expect(this.goToStudioButton).toBeVisible();
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Wait for loading spinner to disappear.
   */
  async waitForSaveComplete(): Promise<void> {
    const spinner = this.loadingSpinner.first();
    const isVisible = await spinner.isVisible().catch(() => false);
    if (isVisible) {
      await spinner.waitFor({ state: 'hidden', timeout: 10000 });
    }
  }
}
