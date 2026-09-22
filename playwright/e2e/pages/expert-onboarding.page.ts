import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';

/**
 * Page Object Model for the Expert Path onboarding screens
 * (positioning → corpus → first-system).
 *
 * The three screens share `ExpertStepHeader` / `ExpertStepActions`, so the
 * badge, continue and skip controls are resolved once here. Everything else
 * is addressed by its accessible name, which is what the operator sees.
 *
 * @module expert-onboarding.page
 */
export class ExpertOnboardingPage {
  readonly page: Page;

  readonly headline: Locator;
  readonly stepBadge: Locator;
  readonly continueButton: Locator;
  readonly skipButton: Locator;

  // Positioning
  readonly answerInput: Locator;
  readonly saveAnswerButton: Locator;
  readonly scoreButton: Locator;
  readonly scorecard: Locator;

  // Corpus
  readonly sourceUrlInput: Locator;
  readonly sourceTitleInput: Locator;
  readonly addSourceButton: Locator;

  // First system
  readonly generateButton: Locator;
  readonly enterWorkspaceButton: Locator;
  readonly planItems: Locator;

  constructor(page: Page) {
    this.page = page;

    this.headline = page.locator('h1').first();
    this.stepBadge = page.getByText(/Expert Path · Step \d of \d/);
    this.continueButton = page.getByRole('button', { name: 'Continue' });
    this.skipButton = page.getByRole('button', { name: 'Skip for now' });

    this.answerInput = page.getByLabel('Your answer');
    this.saveAnswerButton = page.getByRole('button', { name: 'Save answer' });
    this.scoreButton = page.getByRole('button', {
      name: 'Score my positioning',
    });
    this.scorecard = page.getByText('Positioning score');

    this.sourceUrlInput = page.getByLabel('Public URL');
    this.sourceTitleInput = page.getByLabel('Title', { exact: true });
    this.addSourceButton = page.getByRole('button', { name: 'Add to corpus' });

    this.generateButton = page.getByRole('button', {
      name: 'Generate my first system',
    });
    this.enterWorkspaceButton = page.getByRole('button', {
      name: 'Enter workspace',
    });
    this.planItems = page.getByRole('listitem').filter({
      has: page.getByRole('button', { name: 'Approve' }),
    });
  }

  async assertOnPath(path: string): Promise<void> {
    await expect
      .poll(() => new URL(this.page.url()).pathname, { timeout: 30000 })
      .toBe(path);
  }

  async assertStepBadge(current: number, total: number): Promise<void> {
    await expect(this.stepBadge).toContainText(`Step ${current} of ${total}`, {
      timeout: 30000,
    });
  }

  /** Answer every question the interview serves, then score the session. */
  async answerPositioningQuestions(answers: string[]): Promise<void> {
    for (const answer of answers) {
      await expect(this.answerInput).toBeVisible({ timeout: 30000 });
      await this.answerInput.fill(answer);
      await this.saveAnswerButton.click();
    }

    await expect(this.scoreButton).toBeEnabled({ timeout: 30000 });
    await this.scoreButton.click();
  }

  async addCorpusUrl(url: string, title: string): Promise<void> {
    await expect(this.sourceUrlInput).toBeVisible({ timeout: 30000 });
    await this.sourceUrlInput.fill(url);
    await this.sourceTitleInput.fill(title);
    await this.addSourceButton.click();
  }

  async gotoFirstSystem(): Promise<void> {
    await this.page.goto(APP_ROUTES.ONBOARDING.FIRST_SYSTEM, {
      timeout: 120000,
      waitUntil: 'domcontentloaded',
    });
  }
}
