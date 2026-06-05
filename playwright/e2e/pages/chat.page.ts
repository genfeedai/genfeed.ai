import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';

export class ChatPage {
  readonly page: Page;
  readonly url = '/chat/new';
  readonly heading: Locator;
  readonly chatInput: Locator;
  readonly planModeButton: Locator;
  readonly planReviewCard: Locator;
  readonly approvePlanButton: Locator;
  readonly requestPlanChangesButton: Locator;
  readonly revisionNoteInput: Locator;
  readonly sendButton: Locator;
  readonly publishCaption: Locator;
  readonly publishSchedule: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', { name: /GenFeed Agent/i });
    this.chatInput = page
      .locator(
        '[data-testid="agent-chat-input-shell"] [contenteditable="true"]',
      )
      .first();
    this.planModeButton = page.getByRole('button', {
      name: /Enable plan mode|Disable plan mode/i,
    });
    this.planReviewCard = page.getByTestId('agent-plan-review-card');
    this.approvePlanButton = page.getByRole('button', { name: 'Approve' });
    this.requestPlanChangesButton = page.getByRole('button', {
      name: 'Request changes',
    });
    this.revisionNoteInput = page.getByPlaceholder(
      'Add feedback if you want the plan revised',
    );
    this.sendButton = page
      .getByTestId('app-main-content')
      .getByRole('button', { name: 'Generate' });
    this.publishCaption = page.getByPlaceholder('Optional caption override');
    this.publishSchedule = page.locator('input[type="datetime-local"]');
  }

  async goto(): Promise<void> {
    await this.page.goto(this.url, { waitUntil: 'domcontentloaded' });
    await this.waitForPageLoad();
  }

  async waitForPageLoad(): Promise<void> {
    await this.page.waitForLoadState('domcontentloaded');

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        await expect(this.chatInput).toBeVisible({ timeout: 10_000 });
        return;
      } catch (error) {
        if (attempt === 1) {
          const mainHtml = await this.page
            .locator('main')
            .innerHTML()
            .catch(() => 'no-main');
          const bodyText = await this.page
            .locator('body')
            .innerText()
            .catch(() => '');
          throw new Error(
            `ChatPage.waitForPageLoad failed at ${this.page.url()}\nBODY:\n${bodyText}\nMAIN:\n${mainHtml}`,
            { cause: error },
          );
        }

        const mainText = await this.page
          .locator('main')
          .innerText()
          .catch(() => '');

        if (mainText.trim().length > 0) {
          throw error;
        }

        await this.page.reload({ waitUntil: 'domcontentloaded' });
      }
    }
  }

  async sendPrompt(prompt: string): Promise<void> {
    await this.chatInput.click();
    await this.chatInput.pressSequentially(prompt);
    await this.chatInput.press('Enter');
  }

  async enablePlanMode(): Promise<void> {
    await this.planModeButton.click();
  }

  platformButton(platform: string): Locator {
    return this.page.getByRole('button', { name: platform });
  }

  confirmPublishButton(): Locator {
    return this.page.getByRole('button', {
      name: /Confirm publish|Confirm schedule|Publishing/i,
    });
  }
}
