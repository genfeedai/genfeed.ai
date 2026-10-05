import { brandPath, orgPath } from '@e2e/utils/app-chrome';
import {
  APP_ROUTES,
  ONBOARDING_GREETING,
} from '@genfeedai/contracts/constants';
import type { Page } from '@playwright/test';
import { expect, test } from '../../fixtures/onboarding.fixture';

async function assertButtonOnly(page: Page, title: string) {
  await expect(
    page.getByRole('heading', { name: title, exact: true, level: 3 }),
  ).toBeVisible();
  await expect(page.locator('form')).toHaveCount(0);
  await expect(page.getByRole('textbox')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Skip to workspace' }),
  ).toHaveCount(0);
}
async function click(page: Page, label: string) {
  await page.getByRole('button', { name: label, exact: true }).click();
}

test.describe('Conversational onboarding', () => {
  test.setTimeout(180_000);
  test('starts at the conversation and completes one URL plus button questions into the workspace', async ({
    onboardingPage: page,
  }) => {
    await expect(page).toHaveURL(
      new RegExp(`${orgPath(APP_ROUTES.AGENT.ONBOARDING)}/`),
    );
    await expect(page.getByText(ONBOARDING_GREETING)).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Your brand link', level: 3 }),
    ).toBeVisible();
    await expect(page.locator('form')).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Skip to workspace' }),
    ).toHaveCount(0);
    await page.getByRole('textbox').fill('https://genfeed.ai');
    await click(page, 'Use this answer');
    await expect(page.getByText('Tone: Friendly')).toBeVisible();
    await assertButtonOnly(page, 'goals');
    await click(page, 'Grow audience');
    await click(page, 'Build authority');
    const goals = page.waitForRequest(
      (request) =>
        request.url().includes('/responses') && request.method() === 'POST',
    );
    await click(page, 'Submit answers');
    expect((await goals).postDataJSON()).toMatchObject({
      optionIds: ['grow_audience', 'build_authority'],
    });
    await assertButtonOnly(page, 'platforms');
    await click(page, 'X');
    await click(page, 'LinkedIn');
    await click(page, 'Submit answers');
    await assertButtonOnly(page, 'cadence');
    await click(page, 'Skip');
    await assertButtonOnly(page, 'tone');
    await click(page, 'More casual');
    await assertButtonOnly(page, 'Your brand is ready');
    await expect(
      page.getByRole('button', { name: 'Create my first post', exact: true }),
    ).toBeVisible();
    const completed = page.waitForRequest(
      (request) =>
        request.url().endsWith('/users/me') && request.method() === 'PATCH',
    );
    await click(page, 'Go to my workspace');
    expect((await completed).postDataJSON()).toMatchObject({
      isOnboardingCompleted: true,
    });
    await expect(page).toHaveURL(
      new RegExp(brandPath(APP_ROUTES.WORKSPACE.OVERVIEW)),
    );
  });
  test('redirects a signed-in incomplete user from the brand route without rendering a form', async ({
    onboardingPage: page,
  }) => {
    await page.goto(APP_ROUTES.ONBOARDING.BRAND);
    await expect(page).toHaveURL(
      new RegExp(`${orgPath(APP_ROUTES.AGENT.ONBOARDING)}/`),
    );
    await expect(page.locator('form')).toHaveCount(0);
    await expect(
      page.getByRole('heading', { name: 'Your brand link', level: 3 }),
    ).toBeVisible();
  });
  for (const branch of ['Try another link', 'Continue without a website']) {
    test(`handles a failed scrape with ${branch}`, async ({
      onboardingPage: page,
    }) => {
      await expect(
        page.getByRole('heading', { name: 'Your brand link', level: 3 }),
      ).toBeVisible();
      await page.getByRole('textbox').fill('https://blocked.example');
      await click(page, 'Use this answer');
      await assertButtonOnly(page, 'Could not read that link');
      await expect(
        page.getByRole('button', { name: 'Try another link', exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole('button', {
          name: 'Continue without a website',
          exact: true,
        }),
      ).toBeVisible();
      await click(page, branch);
      if (branch === 'Try another link') {
        await expect(
          page.getByRole('heading', { name: 'Your brand link', level: 3 }),
        ).toBeVisible();
        await expect(page.getByRole('textbox')).toBeVisible();
        await page.getByRole('textbox').fill('https://example.com');
        await click(page, 'Use this answer');
        await assertButtonOnly(page, 'goals');
      }
      await assertButtonOnly(page, 'goals');
    });
  }
});
