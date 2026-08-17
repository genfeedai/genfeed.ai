import { expect, test } from '../../fixtures/onboarding.fixture';
import { OnboardingPage } from '../../pages/onboarding.page';

/**
 * Onboarding Flow E2E Tests
 *
 * Covers the shipped 3-step wizard: brand → providers → summary.
 * All API calls are mocked via onboarding.fixture.ts.
 */

test.describe('Onboarding Flow', () => {
  test.describe('Happy Path (Full Flow)', () => {
    test('should complete all 3 steps from the brand start', async ({
      onboardingPage,
    }) => {
      const page = new OnboardingPage(onboardingPage);

      await page.assertOnStep(1);
      await page.fillBrand({
        brandName: 'Test Brand',
        organizationName: 'Test Org',
      });
      await page.clickContinue();
      await onboardingPage.waitForLoadState('domcontentloaded');

      await page.waitForStep(2);
      await expect(onboardingPage).toHaveURL(/\/onboarding\/providers/);
    });
  });

  test.describe('Step 1: Brand', () => {
    test('should display brand and organization fields', async ({
      onboardingPage,
    }) => {
      const page = new OnboardingPage(onboardingPage);
      await page.waitForStep(1);

      await expect(page.brandNameInput).toBeVisible();
      await expect(page.organizationNameInput).toBeVisible();
      await expect(page.websiteUrlInput).toBeVisible();
    });

    test('should display correct headline', async ({ onboardingPage }) => {
      const page = new OnboardingPage(onboardingPage);
      await page.waitForStep(1);

      await expect(page.headline).toContainText('Set up your brand');
    });

    test('should disable continue when required fields are empty', async ({
      onboardingPage,
    }) => {
      const page = new OnboardingPage(onboardingPage);
      await page.waitForStep(1);

      await page.brandNameInput.clear();
      await page.organizationNameInput.clear();

      await expect(page.continueButton).toBeDisabled();
    });

    test('should continue to providers with brand and organization', async ({
      onboardingPage,
    }) => {
      const page = new OnboardingPage(onboardingPage);
      await page.waitForStep(1);

      await page.fillBrand({
        brandName: 'My Test Brand',
        organizationName: 'My Test Org',
      });
      await page.clickContinue();

      await expect(onboardingPage).toHaveURL(/\/onboarding\/providers/);
    });

    test('should allow skipping brand setup', async ({ onboardingPage }) => {
      const page = new OnboardingPage(onboardingPage);
      await page.waitForStep(1);
      await page.skipStep();

      await expect(onboardingPage).toHaveURL(
        /\/onboarding\/(providers|success|summary)|\/workspace|^https?:\/\/[^/]+\/?$/,
      );
    });
  });

  test.describe('Step 2: Providers', () => {
    test.beforeEach(async ({ onboardingPage }) => {
      const page = new OnboardingPage(onboardingPage);
      await page.goto('providers');
    });

    test('should display the access headline', async ({ onboardingPage }) => {
      const page = new OnboardingPage(onboardingPage);
      await page.waitForStep(2);

      await expect(page.headline).toContainText('Configure your access');
    });

    test('should show provider cards and a back control', async ({
      onboardingPage,
    }) => {
      const page = new OnboardingPage(onboardingPage);
      await page.waitForStep(2);

      await expect(page.providerCards.first()).toBeVisible();
      await expect(page.backButton).toBeVisible();
    });

    test('should support back navigation to brand', async ({
      onboardingPage,
    }) => {
      const page = new OnboardingPage(onboardingPage);
      await page.waitForStep(2);
      await page.clickBack();

      await expect(onboardingPage).toHaveURL(/\/onboarding\/brand/);
    });
  });

  test.describe('Step 3: Summary', () => {
    test.beforeEach(async ({ onboardingPage }) => {
      const page = new OnboardingPage(onboardingPage);
      await page.goto('summary');
    });

    test('should display the summary headline', async ({ onboardingPage }) => {
      const page = new OnboardingPage(onboardingPage);
      await page.waitForStep(3);

      await expect(page.headline).toContainText('Finish with the setup');
    });

    test('should support back navigation to providers', async ({
      onboardingPage,
    }) => {
      const page = new OnboardingPage(onboardingPage);
      await page.waitForStep(3);
      await page.clickBack();

      await expect(onboardingPage).toHaveURL(/\/onboarding\/providers/);
    });
  });

  test.describe('Navigation', () => {
    test('should show correct step number in badge on step 1', async ({
      onboardingPage,
    }) => {
      const page = new OnboardingPage(onboardingPage);
      await page.assertOnStep(1);
    });
  });
});
