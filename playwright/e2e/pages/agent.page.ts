import { orgPath } from '@e2e/utils/app-chrome';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';

export class AgentPage {
  readonly page: Page;
  // Org-scoped: the bare `/agent/new` path renders, but the client only
  // resolves `orgSlug`/`brandSlug` from route params or the pathname's own
  // `/:orgSlug/~/...` shape (see `useOrgUrl`), so a bare-path visit leaves the
  // thread-promotion push (`activeHref`) unable to resolve org scope. Every
  // other agent spec already navigates org-scoped (see
  // chat-flow-interactions.spec.ts's `ORG` constant); this page object must
  // match or the post-send URL assertions in its specs never settle.
  readonly url = orgPath(APP_ROUTES.AGENT.NEW);
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
      name: /^Agent mode:/,
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
            `AgentPage.waitForPageLoad failed at ${this.page.url()}\nBODY:\n${bodyText}\nMAIN:\n${mainHtml}`,
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
    await this.page.getByRole('menuitemradio', { name: /^Plan/ }).click();
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
