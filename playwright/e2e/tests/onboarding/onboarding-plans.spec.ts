import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { expect, test } from '../../fixtures/onboarding.fixture';

/**
 * Cloud has no free tier (#11590). An organization that never paid leaves the
 * onboarding on the plan and credits choice; a paying one goes straight to its
 * workspace. The API refuses an unpaid publish on its own, so this screen is
 * the way out, not the gate.
 */
test.describe('Plan choice after onboarding', () => {
  test.setTimeout(120_000);

  test('offers Pro, Scale and Credits only to an organization that never paid', async ({
    neverPaidOnboardingPage: page,
  }) => {
    await page.goto(APP_ROUTES.ONBOARDING.PLANS);

    await expect(
      page.getByRole('heading', {
        name: 'Your first posts are ready. Pick a plan to publish them.',
      }),
    ).toBeVisible();
    const choice = page.getByRole('radiogroup', { name: 'Plan' });
    await expect(choice.getByRole('radio')).toHaveCount(3);
    await expect(page.getByTestId('onboarding-plan-pro')).toBeVisible();
    await expect(page.getByTestId('onboarding-plan-scale')).toBeVisible();
    await expect(page.getByTestId('onboarding-plan-credits')).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Read my drafts first' }),
    ).toHaveAttribute('href', /\/publishing\/posts\?status=draft$/);
  });

  test('sends a paying organization into its workspace', async ({
    onboardingPage: page,
  }) => {
    await page.goto(APP_ROUTES.ONBOARDING.PLANS);

    await expect(
      page.getByRole('heading', { name: "You're all set" }),
    ).toBeVisible();
    await expect(page.getByRole('radio')).toHaveCount(0);
    await expect(
      page.getByRole('link', { name: 'Open my workspace' }),
    ).toBeVisible();
  });
});
