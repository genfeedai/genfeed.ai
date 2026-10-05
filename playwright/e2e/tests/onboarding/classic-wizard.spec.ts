import { expect, test } from '../../fixtures/onboarding.fixture';
import { OnboardingPage } from '../../pages/onboarding.page';

test.describe('Desktop classic onboarding', () => {
  test('reaches brand and continues through providers and summary without guide approval', async ({
    desktopOnboardingPage,
  }) => {
    const wizard = new OnboardingPage(desktopOnboardingPage);
    await expect(desktopOnboardingPage).toHaveURL(/\/onboarding\/brand$/);
    await expect(
      desktopOnboardingPage.getByRole('heading', {
        name: 'Review your brand guide',
      }),
    ).toBeVisible();
    await expect(wizard.continueButton).toHaveAttribute(
      'data-brand-os-navigation',
    );
    await expect(wizard.continueButton).toBeEnabled();
    await wizard.clickContinue();
    await wizard.assertOnStep(2);
    await wizard.continueWithServerDefaults();
    await wizard.assertOnStep(3);
    await wizard.continueWithSelfHosted();
    await wizard.assertSuccess();
  });

  test('keeps classic Skip available without approval', async ({
    desktopOnboardingPage,
  }) => {
    const wizard = new OnboardingPage(desktopOnboardingPage);
    await expect(wizard.skipButton).toBeVisible();
    await expect(wizard.skipButton).toHaveAttribute('data-brand-os-navigation');
    await wizard.skipStep();
    await expect(desktopOnboardingPage).toHaveURL(
      /\/test-org\/brand-1\/workspace\/overview$/,
    );
  });
});
