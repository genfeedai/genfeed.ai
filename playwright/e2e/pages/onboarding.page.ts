import { APP_ROUTES, ONBOARDING_STEPS } from '@genfeedai/contracts/constants';
import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';

/**
 * Page Object Model for the onboarding wizard screens
 * (brand → providers → summary) plus the success screen.
 *
 * On web the wizard is agent-first: brand is the only screen a cloud operator
 * is walked through, and continuing from it hands off to the
 * `/agent/onboarding` conversation. Providers and summary stay reachable as
 * their own destinations, so specs enter that tail directly via `goto()`.
 *
 * @module onboarding.page
 */

export class OnboardingPage {
  readonly page: Page;

  readonly stepBadge: Locator;
  readonly headline: Locator;
  readonly backButton: Locator;
  readonly continueButton: Locator;
  readonly skipButton: Locator;
  readonly loadingSpinner: Locator;

  readonly brandNameInput: Locator;
  readonly organizationNameInput: Locator;
  readonly websiteUrlInput: Locator;

  readonly providerCards: Locator;
  readonly providerContinueButton: Locator;
  readonly summaryCards: Locator;
  readonly summaryContinueButton: Locator;
  readonly successIcon: Locator;
  readonly goToStudioButton: Locator;

  constructor(page: Page) {
    this.page = page;

    this.stepBadge = page.locator('.step-badge').first();
    this.headline = page.locator('h1').first();
    this.backButton = page.getByRole('button', { name: 'Back' });
    this.continueButton = page.getByRole('button', { name: 'Continue' });
    this.skipButton = page.getByRole('button', { name: /Skip Onboarding/i });
    this.loadingSpinner = page.locator('.animate-spin');

    this.brandNameInput = page.locator('#brand-name');
    this.organizationNameInput = page.locator('#organization-name');
    this.websiteUrlInput = page.locator('#brand-website-url');

    this.providerCards = page.locator('.provider-card');
    this.providerContinueButton = page.getByRole('button', {
      name: /Continue with server defaults/i,
    });
    this.summaryCards = page.locator('.summary-card');
    this.summaryContinueButton = page.getByRole('button', {
      name: /Continue with self-hosted/i,
    });
    this.successIcon = page.locator('.success-icon');
    this.goToStudioButton = page.getByRole('button', {
      name: /Enter Workspace|Go to Studio/i,
    });
  }

  async goto(
    step: (typeof ONBOARDING_STEPS)[number] | 'success' = 'brand',
  ): Promise<void> {
    const path =
      step === 'success'
        ? APP_ROUTES.ONBOARDING.SUCCESS
        : `/onboarding/${step}`;
    await this.page.goto(path, {
      timeout: 120000,
      waitUntil: 'domcontentloaded',
    });
  }

  async waitForStep(stepNumber: number): Promise<void> {
    await this.stepBadge.waitFor({ state: 'visible', timeout: 30000 });
    await expect(this.stepBadge).toContainText(
      `Step ${stepNumber} of ${ONBOARDING_STEPS.length}`,
    );
  }

  async assertOnStep(stepNumber: number): Promise<void> {
    const stepPath = ONBOARDING_STEPS[stepNumber - 1];
    await expect
      .poll(() => new URL(this.page.url()).pathname)
      .toBe(`/onboarding/${stepPath}`);
    await this.waitForStep(stepNumber);
  }

  /**
   * The brand step hands web operators to the agent conversation. Callers
   * provide the canonical organization-scoped path for an exact assertion.
   */
  async assertAgentHandoff(expectedPath: string): Promise<void> {
    await expect
      .poll(() => new URL(this.page.url()).pathname)
      .toBe(expectedPath);
  }

  async fillBrand(data: {
    brandName: string;
    organizationName: string;
    websiteUrl?: string;
  }): Promise<void> {
    await this.brandNameInput.fill(data.brandName);
    await this.organizationNameInput.fill(data.organizationName);
    if (data.websiteUrl) {
      await this.websiteUrlInput.fill(data.websiteUrl);
    }
  }

  async clickContinue(): Promise<void> {
    await this.continueButton.click();
  }

  async clickBack(): Promise<void> {
    await this.backButton.click();
  }

  async continueWithServerDefaults(): Promise<void> {
    await this.providerContinueButton.click();
  }

  async continueWithSelfHosted(): Promise<void> {
    await this.summaryContinueButton.click();
  }

  async skipStep(): Promise<void> {
    await this.skipButton.first().click();
  }

  async assertSuccess(): Promise<void> {
    await expect
      .poll(() => new URL(this.page.url()).pathname)
      .toBe(APP_ROUTES.ONBOARDING.SUCCESS);
    await this.successIcon.waitFor({ state: 'visible', timeout: 30000 });
    await expect(this.goToStudioButton).toBeVisible();
  }

  async enterWorkspace(): Promise<void> {
    await this.goToStudioButton.click();
  }

  async waitForSaveComplete(): Promise<void> {
    const spinner = this.loadingSpinner.first();
    const isVisible = await spinner.isVisible().catch(() => false);
    if (isVisible) {
      await spinner.waitFor({ state: 'hidden', timeout: 10000 });
    }
  }
}
