import { orgPath } from '@e2e/utils/app-chrome';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { expect, test } from '../../fixtures/onboarding.fixture';
import { setupOnboardingFirstDraftsMocks } from '../../utils/onboarding-first-drafts-mocks';

test.describe('Output-first onboarding', () => {
  test.setTimeout(120_000);

  test('shows the four drafts for a work-email domain without asking anything', async ({
    onboardingPage: page,
  }) => {
    await expect(page).toHaveURL(new RegExp(`${APP_ROUTES.ONBOARDING.BRAND}$`));
    for (const platform of ['twitter', 'instagram', 'tiktok', 'linkedin']) {
      await expect(page.getByText(`Round 1 ${platform} draft`)).toBeVisible();
    }
    await expect(
      page.getByRole('heading', { name: 'X', level: 2 }),
    ).toBeVisible();
    await expect(page.getByRole('textbox')).toHaveCount(0);

    const completed = page.waitForRequest(
      (request) =>
        request.url().endsWith('/users/me') && request.method() === 'PATCH',
    );
    await page.getByRole('button', { name: 'Looks right, continue' }).click();
    expect((await completed).postDataJSON()).toMatchObject({
      isOnboardingCompleted: true,
    });
    await expect(page).toHaveURL(
      new RegExp(orgPath(APP_ROUTES.WORKSPACE.OVERVIEW)),
    );
  });

  test('asks for brand context only after "doesn\'t look right" and stops at two rounds', async ({
    personalEmailOnboardingPage: page,
  }) => {
    const { draftRequests } = await setupOnboardingFirstDraftsMocks(page);
    await page.getByRole('textbox').fill('@genfeed');
    await page.getByRole('button', { name: 'Create my first posts' }).click();

    await expect(page.getByText('Round 1 twitter draft')).toBeVisible();
    await page.getByRole('button', { name: "This doesn't look right" }).click();
    await page
      .getByPlaceholder('Founders who ship fast')
      .fill('Indie founders');
    await page.getByRole('button', { name: 'Redo my posts' }).click();

    await expect(page.getByText('Round 2 twitter draft')).toBeVisible();
    expect(draftRequests).toHaveLength(2);
    expect(draftRequests[1]).toMatchObject({
      context: { audience: 'Indie founders' },
      previousRequestKey: 'key-twitter-1',
    });
    await expect(
      page.getByRole('button', { name: "This doesn't look right" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Looks right, continue' }),
    ).toBeVisible();
  });

  test('goes straight to the brand-context round when the link cannot be read', async ({
    personalEmailOnboardingPage: page,
  }) => {
    await setupOnboardingFirstDraftsMocks(page, { isScanFailing: true });
    await page.getByRole('textbox').fill('https://blocked.example');
    await page.getByRole('button', { name: 'Create my first posts' }).click();

    await expect(
      page.getByText("We couldn't read that link", { exact: false }),
    ).toBeVisible();
    await page
      .getByPlaceholder('Founders who ship fast')
      .fill('Indie founders');
    await page.getByRole('button', { name: 'Redo my posts' }).click();
    await expect(page.getByText('Round 1 twitter draft')).toBeVisible();
  });

  test('lets a visitor without a link describe the brand instead', async ({
    personalEmailOnboardingPage: page,
  }) => {
    await setupOnboardingFirstDraftsMocks(page);
    await page.getByRole('button', { name: "I don't have a link yet" }).click();
    await expect(page.getByText('Tell us what we missed')).toBeVisible();
  });

  test('never lands on the removed agent onboarding', async ({
    onboardingPage: page,
  }) => {
    await page.goto(APP_ROUTES.ONBOARDING.ROOT);
    await expect(page).toHaveURL(new RegExp(`${APP_ROUTES.ONBOARDING.BRAND}$`));
    expect(page.url()).not.toContain('agent');
  });
});
