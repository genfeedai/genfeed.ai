import { brandPath } from '@e2e/utils/app-chrome';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { expect, test } from '../../fixtures/onboarding.fixture';
import { ExpertOnboardingPage } from '../../pages/expert-onboarding.page';
import { OnboardingPage } from '../../pages/onboarding.page';

/**
 * Expert Path Onboarding E2E (epic #4534)
 *
 * Walks the journey an expert signup takes on an agent-first surface:
 * `brand → positioning → corpus → first-system → workspace`. Every API call
 * is mocked (see `utils/expert-path-mocks.ts`), so no interview credits, no
 * ingestion worker and no content generation run.
 */

const POSITIONING_ANSWERS = [
  'I ran revenue operations at two Series B companies and rebuilt both pipelines.',
  'Pipeline is a distribution problem before it is ever a headcount problem.',
];

test.describe('Expert Path Onboarding', () => {
  test.setTimeout(120_000);

  test('walks positioning, corpus and the first system into the workspace', async ({
    expertOnboardingPage,
  }) => {
    const wizard = new OnboardingPage(expertOnboardingPage);
    const expert = new ExpertOnboardingPage(expertOnboardingPage);

    // --- Brand ---------------------------------------------------------------
    await wizard.waitForStep(1);
    await wizard.fillBrand({
      brandName: 'Expert Brand',
    });
    await wizard.clickContinue();

    // An expert never hands off to the agent conversation after brand setup.
    await expert.assertOnPath(APP_ROUTES.ONBOARDING.POSITIONING);
    await expert.assertStepBadge(2, 4);

    // --- Positioning ---------------------------------------------------------
    await expert.answerPositioningQuestions(POSITIONING_ANSWERS);

    await expect(expert.scorecard).toBeVisible({ timeout: 30000 });
    await expect(expertOnboardingPage.getByText('76 / 100')).toBeVisible();
    await expect(
      expertOnboardingPage.getByText('Good foundation'),
    ).toBeVisible();

    await expect(expert.continueButton).toBeEnabled();
    await expert.continueButton.click();

    // --- Corpus --------------------------------------------------------------
    await expert.assertOnPath(APP_ROUTES.ONBOARDING.CORPUS);
    await expert.assertStepBadge(3, 4);

    // Continue stays locked until at least one source finishes ingesting.
    await expect(expert.continueButton).toBeDisabled();

    await expert.addCorpusUrl(
      'https://expert.example.com/keynote',
      '2026 keynote transcript',
    );

    await expect(
      expertOnboardingPage.getByText('2026 keynote transcript'),
    ).toBeVisible({ timeout: 30000 });
    // The source starts QUEUED; the step's poll flips it to READY.
    await expect(
      expertOnboardingPage.getByText('Ready', { exact: true }),
    ).toBeVisible({ timeout: 30000 });
    await expect(expertOnboardingPage.getByText('1 of 1 ready')).toBeVisible();

    await expect(expert.continueButton).toBeEnabled({ timeout: 30000 });
    await expert.continueButton.click();

    // --- First system --------------------------------------------------------
    await expert.assertOnPath(APP_ROUTES.ONBOARDING.FIRST_SYSTEM);
    await expert.assertStepBadge(4, 4);

    await expect(expert.generateButton).toBeVisible({ timeout: 30000 });
    await expert.generateButton.click();

    await expect(expert.planItems).toHaveCount(3, { timeout: 60000 });
    await expect(
      expertOnboardingPage.getByText('Grounded in 1 corpus sources'),
    ).toBeVisible();
    await expect(
      expertOnboardingPage.getByText('Connect linkedin to schedule').first(),
    ).toBeVisible();

    // Approving one item hands it to the content engine; nothing publishes.
    await expert.planItems
      .first()
      .getByRole('button', { name: 'Approve' })
      .click();
    await expect(
      expertOnboardingPage.getByText('Drafting', { exact: true }),
    ).toBeVisible({ timeout: 30000 });

    await expert.enterWorkspaceButton.click();
    await expect
      .poll(() => new URL(expertOnboardingPage.url()).pathname, {
        timeout: 60000,
      })
      .toContain(brandPath(APP_ROUTES.WORKSPACE.ROOT));
  });

  test('blocks generation until positioning and corpus are done', async ({
    expertOnboardingPage,
  }) => {
    const expert = new ExpertOnboardingPage(expertOnboardingPage);
    await expert.gotoFirstSystem();

    await expect(
      expertOnboardingPage.getByText('A couple of things are still missing'),
    ).toBeVisible({ timeout: 30000 });
    await expect(
      expertOnboardingPage.getByRole('link', {
        name: 'Finish your positioning interview',
      }),
    ).toBeVisible();
    await expect(
      expertOnboardingPage.getByRole('link', {
        name: 'Add at least one ready corpus source',
      }),
    ).toBeVisible();
    await expect(expert.generateButton).toBeHidden();
  });

  test('lets an expert skip positioning and pick it up later', async ({
    expertOnboardingPage,
  }) => {
    const expert = new ExpertOnboardingPage(expertOnboardingPage);
    await expertOnboardingPage.goto(APP_ROUTES.ONBOARDING.POSITIONING, {
      timeout: 120000,
      waitUntil: 'domcontentloaded',
    });

    await expect(expert.skipButton).toBeVisible({ timeout: 30000 });
    await expert.skipButton.click();

    await expert.assertOnPath(APP_ROUTES.ONBOARDING.CORPUS);
  });
});
