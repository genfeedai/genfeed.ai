import type { Route } from '@playwright/test';

import { mockActiveSubscription } from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import {
  testBrands,
  testOrganizations,
} from '../../fixtures/test-data.fixture';

/**
 * E2E Tests for the Brand Context Interview stepper (settings surface).
 *
 * CRITICAL: All API calls are mocked — no real backend requests occur.
 * The interview REST endpoints return PLAIN JSON (not JSON:API), matching the
 * BrandInterviewService frontend client.
 *
 * Tests are skipped (not failed) if Better Auth mocking fails to keep the user
 * authenticated, so we never get a false-green that passes without auth.
 */

const brand = testBrands[0];
const org = testOrganizations.default ?? Object.values(testOrganizations)[0];
const interviewUrl = `/${org.slug}/${brand.slug}/settings/interview`;
const AUTH_SKIP_MSG =
  'Auth mocking did not prevent login redirect — fix Better Auth auth mocking';

const toneQuestion = {
  answerType: 'text',
  fieldKey: 'tone',
  group: 'voice',
  isRequired: true,
  questionText: 'How would you describe your brand tone of voice?',
  weight: 0.35,
};

const audienceQuestion = {
  answerType: 'list',
  fieldKey: 'audience',
  group: 'voice',
  hint: 'Comma or newline separated',
  isRequired: true,
  questionText: 'Who is your target audience?',
  weight: 0.35,
};

async function mockBrandResolution(route: Route): Promise<void> {
  await route.fulfill({
    contentType: 'application/json',
    status: 200,
    body: JSON.stringify({
      data: {
        attributes: {
          description: brand.description,
          name: brand.name,
          slug: brand.slug,
        },
        id: brand.id,
        type: 'brands',
      },
    }),
  });
}

test.describe('Brand Context Interview (settings stepper)', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await mockActiveSubscription(authenticatedPage, {
      credits: 1000,
      plan: 'pro',
    });

    // Resolve the brand so the page can derive brandId.
    await authenticatedPage.route(
      `**/api.genfeed.ai/**/brands/${brand.id}**`,
      mockBrandResolution,
    );
    await authenticatedPage.route(
      '**/api.genfeed.ai/**/brands?**',
      async (route) => {
        await route.fulfill({
          contentType: 'application/json',
          status: 200,
          body: JSON.stringify({
            data: [
              {
                attributes: { name: brand.name, slug: brand.slug },
                id: brand.id,
                type: 'brands',
              },
            ],
          }),
        });
      },
    );

    // No active interview on entry.
    await authenticatedPage.route(
      '**/api.genfeed.ai/**/brands/**/interview/active',
      async (route) => {
        await route.fulfill({
          contentType: 'application/json',
          status: 200,
          body: 'null',
        });
      },
    );

    // Completeness: three interviewable gaps so the stepper has work to do.
    await authenticatedPage.route(
      '**/api.genfeed.ai/**/brands/**/completeness',
      async (route) => {
        await route.fulfill({
          contentType: 'application/json',
          status: 200,
          body: JSON.stringify({
            incompleteFieldKeys: ['tone', 'audience', 'goals'],
            interviewableGapCount: 3,
            overallScore: 40,
          }),
        });
      },
    );
  });

  test('starts an interview and shows the first question', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.route(
      '**/api.genfeed.ai/**/brands/**/interview',
      async (route) => {
        if (route.request().method() !== 'POST') return route.fallback();
        await route.fulfill({
          contentType: 'application/json',
          status: 201,
          body: JSON.stringify({
            brandId: brand.id,
            completenessScore: 40,
            creditsCharged: 10,
            currentQuestion: toneQuestion,
            interviewId: 'interview_1',
            progress: {
              answeredFields: 0,
              percentComplete: 0,
              totalFields: 13,
            },
            status: 'in_progress',
          }),
        });
      },
    );

    await authenticatedPage.goto(interviewUrl);
    test.skip(authenticatedPage.url().includes('/login'), AUTH_SKIP_MSG);

    // Credit disclosure is visible before starting.
    await expect(authenticatedPage.getByText(/10 credits/i)).toBeVisible();

    await authenticatedPage
      .getByRole('button', { name: /start interview/i })
      .click();

    await expect(
      authenticatedPage.getByText(toneQuestion.questionText),
    ).toBeVisible();
  });

  test('submits an answer and advances, then completes', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.route(
      '**/api.genfeed.ai/**/brands/**/interview',
      async (route) => {
        if (route.request().method() !== 'POST') return route.fallback();
        await route.fulfill({
          contentType: 'application/json',
          status: 201,
          body: JSON.stringify({
            brandId: brand.id,
            completenessScore: 40,
            creditsCharged: 10,
            currentQuestion: toneQuestion,
            interviewId: 'interview_1',
            progress: {
              answeredFields: 0,
              percentComplete: 0,
              totalFields: 13,
            },
            status: 'in_progress',
          }),
        });
      },
    );

    let answerCalls = 0;
    await authenticatedPage.route(
      '**/api.genfeed.ai/**/brands/interview/**/answer',
      async (route) => {
        answerCalls += 1;
        const isComplete = answerCalls >= 2;
        await route.fulfill({
          contentType: 'application/json',
          status: 201,
          body: JSON.stringify({
            completenessScore: isComplete ? 75 : 55,
            interviewId: 'interview_1',
            isComplete,
            nextQuestion: isComplete ? null : audienceQuestion,
            progress: {
              answeredFields: answerCalls,
              percentComplete: isComplete ? 100 : 50,
              totalFields: 13,
            },
            status: isComplete ? 'completed' : 'in_progress',
          }),
        });
      },
    );

    await authenticatedPage.goto(interviewUrl);
    test.skip(authenticatedPage.url().includes('/login'), AUTH_SKIP_MSG);

    await authenticatedPage
      .getByRole('button', { name: /start interview/i })
      .click();
    await expect(
      authenticatedPage.getByText(toneQuestion.questionText),
    ).toBeVisible();

    // Answer the first question → advances to the audience question.
    await authenticatedPage
      .getByRole('textbox')
      .first()
      .fill('Bold, witty, and direct');
    await authenticatedPage.getByRole('button', { name: /submit/i }).click();
    await expect(
      authenticatedPage.getByText(audienceQuestion.questionText),
    ).toBeVisible();

    // Answer the second question → completes the interview.
    await authenticatedPage
      .getByRole('textbox')
      .first()
      .fill('Founders, indie hackers');
    await authenticatedPage.getByRole('button', { name: /submit/i }).click();

    await expect(authenticatedPage.getByText(/complete/i)).toBeVisible();
  });
});
