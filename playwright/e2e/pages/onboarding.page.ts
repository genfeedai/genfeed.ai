import { APP_ROUTES, ONBOARDING_STEPS } from '@genfeedai/contracts/constants';
import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';

/** Classic wizard pages and the optional brand guide review. */

export class OnboardingPage {
  readonly page: Page;

  readonly stepBadge: Locator;
  readonly continueButton: Locator;
  readonly skipButton: Locator;

  readonly providerContinueButton: Locator;
  readonly summaryContinueButton: Locator;
  readonly successIcon: Locator;
  readonly goToStudioButton: Locator;

  constructor(page: Page) {
    this.page = page;

    this.stepBadge = page.locator('.step-badge').first();
    this.continueButton = page.getByRole('button', { name: 'Continue' });
    this.skipButton = page.getByRole('button', { name: /Skip for now/i });

    this.providerContinueButton = page.getByRole('button', {
      name: /Continue with server defaults/i,
    });
    this.summaryContinueButton = page.getByRole('button', {
      name: /Continue with self-hosted/i,
    });
    this.successIcon = page.locator('.success-icon');
    this.goToStudioButton = page.getByRole('button', {
      name: /Enter Workspace|Go to Studio/i,
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

  async clickContinue(): Promise<void> {
    await this.continueButton.click();
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
}
