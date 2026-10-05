import { APP_ROUTES, ONBOARDING_STEPS } from '@genfeedai/contracts/constants';
import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';

/** Wizard pages and the approval-gated brand guide (#6013). */

export class OnboardingPage {
  readonly page: Page;

  readonly stepBadge: Locator;
  readonly headline: Locator;
  readonly backButton: Locator;
  readonly continueButton: Locator;
  readonly skipButton: Locator;
  readonly loadingSpinner: Locator;

  readonly websiteUrlInput: Locator;
  readonly scanButton: Locator;

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
    this.skipButton = page.getByRole('button', { name: /Skip for now/i });
    this.loadingSpinner = page.locator('.animate-spin');

    this.websiteUrlInput = page.getByLabel('Website URL', { exact: true });
    this.scanButton = page.getByRole('button', {
      name: /^Scan website(?: again)?$/i,
    });

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

  async assertScanPending(): Promise<void> {
    await expect(this.headline).toHaveText('Review your brand guide');
    await expect(this.scanButton).toBeDisabled();
    await expect(this.websiteUrlInput).toBeDisabled();
  }

  async waitForBrandGuide(): Promise<void> {
    await expect(this.headline).toHaveText('Review your brand guide');
    await expect(this.websiteUrlInput).toBeEnabled();
  }

  /** Hold the scan response while asserting the pending controls. */
  async holdWebsiteScan(): Promise<() => void> {
    let release: () => void = () => {};
    const isReleased = new Promise<void>((resolve) => {
      release = resolve;
    });

    await this.page.route(
      /\/brands\/brand-1\/brand-os\/scan$/,
      async (route) => {
        if (route.request().method() === 'POST') {
          await isReleased;
        }
        await route.fallback();
      },
    );

    return release;
  }

  /** Start a website scan from the brand guide. */
  async scanWebsite(websiteUrl?: string): Promise<void> {
    if (websiteUrl) {
      await this.websiteUrlInput.fill(websiteUrl);
    }
    await this.scanButton.click();
  }

  async approveAndContinueBrand(): Promise<void> {
    await expect(this.headline).toHaveText('Review your brand guide');
    await expect(this.continueButton).toBeDisabled();
    await this.page
      .getByRole('button', { name: /^Approve revision$/i })
      .click();
    await expect(this.continueButton).toBeEnabled();
    await this.continueButton.click();
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
