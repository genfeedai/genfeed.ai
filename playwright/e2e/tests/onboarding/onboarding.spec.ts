import { expect, test } from '../../fixtures/onboarding.fixture';
import { OnboardingPage } from '../../pages/onboarding.page';

/**
 * Onboarding Flow E2E Tests
 *
 * Tests the 6-step onboarding wizard + success screen.
 * All API calls are mocked via onboarding.fixture.ts — no real backend calls.
 */

test.describe('Onboarding Flow', () => {
  // --------------------------------------------------------------------------
  // Happy Path
  // --------------------------------------------------------------------------

  test.describe('Happy Path (Full Flow)', () => {
    test('should complete all 6 steps and reach success page', async ({
      onboardingPage,
    }) => {
      const page = new OnboardingPage(onboardingPage);

      // Step 1 — Account Type
      await page.waitForStep(1);
      await page.selectAccountType('Creator');
      await onboardingPage.waitForLoadState('domcontentloaded');

      // Step 2 — Profile
      await page.waitForStep(2);
      await page.fillProfile({
        firstName: 'Test',
        handle: 'testuser',
        lastName: 'Creator',
      });
      await onboardingPage.waitForLoadState('domcontentloaded');

      // Step 3 — Brand (skip)
      await page.waitForStep(3);
      await page.skipStep();
      await onboardingPage.waitForLoadState('domcontentloaded');

      // Step 4 — Preferences
      await page.waitForStep(4);
      await page.selectPreferences(['Images', 'Videos']);
      await page.clickContinue();
      await onboardingPage.waitForLoadState('domcontentloaded');

      // Step 5 — Platforms (skip)
      await page.waitForStep(5);
      await page.skipStep();
      await onboardingPage.waitForLoadState('domcontentloaded');

      // Step 6 — Plan (explore free)
      await page.waitForStep(6);
      await page.clickExplore();
    });
  });

  // --------------------------------------------------------------------------
  // Step 1: Account Type
  // --------------------------------------------------------------------------

  test.describe('Step 1: Account Type', () => {
    test('should display 3 account type cards', async ({ onboardingPage }) => {
      const page = new OnboardingPage(onboardingPage);
      await page.waitForStep(1);

      await expect(page.typeCards).toHaveCount(3);
      await expect(page.typeCards.nth(0)).toContainText('Creator');
      await expect(page.typeCards.nth(1)).toContainText('Business');
      await expect(page.typeCards.nth(2)).toContainText('Agency');
    });

    test('should display correct headline', async ({ onboardingPage }) => {
      const page = new OnboardingPage(onboardingPage);
      await page.waitForStep(1);

      await expect(page.headline).toContainText('How will you use');
    });

    test('should select Creator and navigate to profile', async ({
      onboardingPage,
    }) => {
      const page = new OnboardingPage(onboardingPage);
      await page.waitForStep(1);
      await page.selectAccountType('Creator');

      await expect(onboardingPage).toHaveURL(/\/onboarding\/profile/);
    });

    test('should select Business and navigate to profile', async ({
      onboardingPage,
    }) => {
      const page = new OnboardingPage(onboardingPage);
      await page.waitForStep(1);
      await page.selectAccountType('Business');

      await expect(onboardingPage).toHaveURL(/\/onboarding\/profile/);
    });
  });

  // --------------------------------------------------------------------------
  // Step 2: Profile
  // --------------------------------------------------------------------------

  test.describe('Step 2: Profile', () => {
    test.beforeEach(async ({ onboardingPage }) => {
      const page = new OnboardingPage(onboardingPage);
      await page.waitForStep(1);
      await page.selectAccountType('Creator');
      await onboardingPage.waitForLoadState('domcontentloaded');
    });

    test('should display profile form fields', async ({ onboardingPage }) => {
      const page = new OnboardingPage(onboardingPage);
      await page.waitForStep(2);

      await expect(page.firstNameInput).toBeVisible();
      await expect(page.lastNameInput).toBeVisible();
      await expect(page.handleInput).toBeVisible();
    });

    test('should display correct headline', async ({ onboardingPage }) => {
      const page = new OnboardingPage(onboardingPage);
      await page.waitForStep(2);

      await expect(page.headline).toContainText('Set up your');
    });

    test('should disable submit when required fields are empty', async ({
      onboardingPage,
    }) => {
      const page = new OnboardingPage(onboardingPage);
      await page.waitForStep(2);

      // Clear any prefilled values
      await page.firstNameInput.clear();
      await page.handleInput.clear();

      await expect(page.profileSubmitButton).toBeDisabled();
    });

    test('should fill profile and continue to brand', async ({
      onboardingPage,
    }) => {
      const page = new OnboardingPage(onboardingPage);
      await page.waitForStep(2);

      await page.fillProfile({
        firstName: 'Jane',
        handle: 'janedoe',
        lastName: 'Doe',
      });

      await expect(onboardingPage).toHaveURL(/\/onboarding\/brand/);
    });

    test('should show back button that navigates to account-type', async ({
      onboardingPage,
    }) => {
      const page = new OnboardingPage(onboardingPage);
      await page.waitForStep(2);

      await expect(page.backButton).toBeVisible();
      await page.clickBack();

      await expect(onboardingPage).toHaveURL(/\/onboarding\/account-type/);
    });
  });

  // --------------------------------------------------------------------------
  // Step 3: Brand
  // --------------------------------------------------------------------------

  test.describe('Step 3: Brand', () => {
    test.beforeEach(async ({ onboardingPage }) => {
      // Navigate through steps 1 and 2
      const page = new OnboardingPage(onboardingPage);
      await page.waitForStep(1);
      await page.selectAccountType('Creator');
      await onboardingPage.waitForLoadState('domcontentloaded');
      await page.waitForStep(2);
      await page.fillProfile({ firstName: 'Test', handle: 'testuser' });
      await onboardingPage.waitForLoadState('domcontentloaded');
    });

    test('should display brand name and URL inputs', async ({
      onboardingPage,
    }) => {
      const page = new OnboardingPage(onboardingPage);
      await page.waitForStep(3);

      await expect(page.brandNameInput).toBeVisible();
      await expect(page.websiteUrlInput).toBeVisible();
      await expect(page.scanButton).toBeVisible();
    });

    test('should trigger scan and show scraped data', async ({
      onboardingPage,
    }) => {
      const page = new OnboardingPage(onboardingPage);
      await page.waitForStep(3);

      await page.fillAndScanWebsite('https://example.com');

      await expect(page.scrapedPreview).toBeVisible();
    });

    test('should allow skipping brand setup', async ({ onboardingPage }) => {
      const page = new OnboardingPage(onboardingPage);
      await page.waitForStep(3);
      await page.skipStep();

      await expect(onboardingPage).toHaveURL(/\/onboarding\/preferences/);
    });

    test('should allow continuing with just brand name', async ({
      onboardingPage,
    }) => {
      const page = new OnboardingPage(onboardingPage);
      await page.waitForStep(3);

      await page.fillBrandName('My Test Brand');
      await page.clickContinue();

      await expect(onboardingPage).toHaveURL(/\/onboarding\/preferences/);
    });
  });

  // --------------------------------------------------------------------------
  // Step 4: Preferences
  // --------------------------------------------------------------------------

  test.describe('Step 4: Preferences', () => {
    test.beforeEach(async ({ onboardingPage }) => {
      const page = new OnboardingPage(onboardingPage);
      // Fast-track: go through steps 1-3
      await page.waitForStep(1);
      await page.selectAccountType('Creator');
      await onboardingPage.waitForLoadState('domcontentloaded');
      await page.waitForStep(2);
      await page.fillProfile({ firstName: 'Test', handle: 'testuser' });
      await onboardingPage.waitForLoadState('domcontentloaded');
      await page.waitForStep(3);
      await page.skipStep();
      await onboardingPage.waitForLoadState('domcontentloaded');
    });

    test('should display 4 content type cards', async ({ onboardingPage }) => {
      const page = new OnboardingPage(onboardingPage);
      await page.waitForStep(4);

      await expect(page.prefCards).toHaveCount(4);
    });

    test('should display correct headline', async ({ onboardingPage }) => {
      const page = new OnboardingPage(onboardingPage);
      await page.waitForStep(4);

      await expect(page.headline).toContainText('What do you want to');
    });

    test('should allow multi-select and continue', async ({
      onboardingPage,
    }) => {
      const page = new OnboardingPage(onboardingPage);
      await page.waitForStep(4);

      await page.selectPreferences(['Images', 'Videos']);
      await page.clickContinue();

      await expect(onboardingPage).toHaveURL(/\/onboarding\/platforms/);
    });

    test('should allow skipping preferences', async ({ onboardingPage }) => {
      const page = new OnboardingPage(onboardingPage);
      await page.waitForStep(4);
      await page.skipStep();

      await expect(onboardingPage).toHaveURL(/\/onboarding\/platforms/);
    });
  });

  // --------------------------------------------------------------------------
  // Step 5: Platforms
  // --------------------------------------------------------------------------

  test.describe('Step 5: Platforms', () => {
    test.beforeEach(async ({ onboardingPage }) => {
      const page = new OnboardingPage(onboardingPage);
      // Fast-track: go through steps 1-4
      await page.waitForStep(1);
      await page.selectAccountType('Creator');
      await onboardingPage.waitForLoadState('domcontentloaded');
      await page.waitForStep(2);
      await page.fillProfile({ firstName: 'Test', handle: 'testuser' });
      await onboardingPage.waitForLoadState('domcontentloaded');
      await page.waitForStep(3);
      await page.skipStep();
      await onboardingPage.waitForLoadState('domcontentloaded');
      await page.waitForStep(4);
      await page.skipStep();
      await onboardingPage.waitForLoadState('domcontentloaded');
    });

    test('should display 6 platform cards', async ({ onboardingPage }) => {
      const page = new OnboardingPage(onboardingPage);
      await page.waitForStep(5);

      await expect(page.platformCards).toHaveCount(6);
    });

    test('should display correct headline', async ({ onboardingPage }) => {
      const page = new OnboardingPage(onboardingPage);
      await page.waitForStep(5);

      await expect(page.headline).toContainText('Connect your');
    });

    test('should show Connect buttons for each platform', async ({
      onboardingPage,
    }) => {
      const page = new OnboardingPage(onboardingPage);
      await page.waitForStep(5);

      const connectButtons = page.platformCards.locator('button', {
        hasText: 'Connect',
      });
      await expect(connectButtons).toHaveCount(6);
    });

    test('should allow skipping without connecting', async ({
      onboardingPage,
    }) => {
      const page = new OnboardingPage(onboardingPage);
      await page.waitForStep(5);
      await page.skipStep();

      await expect(onboardingPage).toHaveURL(/\/onboarding\/plan/);
    });
  });

  // --------------------------------------------------------------------------
  // Step 6: Plan
  // --------------------------------------------------------------------------

  test.describe('Step 6: Plan', () => {
    test.beforeEach(async ({ onboardingPage }) => {
      const page = new OnboardingPage(onboardingPage);
      // Fast-track: go through steps 1-5
      await page.waitForStep(1);
      await page.selectAccountType('Creator');
      await onboardingPage.waitForLoadState('domcontentloaded');
      await page.waitForStep(2);
      await page.fillProfile({ firstName: 'Test', handle: 'testuser' });
      await onboardingPage.waitForLoadState('domcontentloaded');
      await page.waitForStep(3);
      await page.skipStep();
      await onboardingPage.waitForLoadState('domcontentloaded');
      await page.waitForStep(4);
      await page.skipStep();
      await onboardingPage.waitForLoadState('domcontentloaded');
      await page.waitForStep(5);
      await page.skipStep();
      await onboardingPage.waitForLoadState('domcontentloaded');
    });

    test('should display Pro, Scale, Enterprise plan cards', async ({
      onboardingPage,
    }) => {
      const page = new OnboardingPage(onboardingPage);
      await page.waitForStep(6);

      await expect(page.planCards).toHaveCount(3);
      await expect(page.planCards.nth(0)).toContainText('Pro');
      await expect(page.planCards.nth(1)).toContainText('Scale');
      await expect(page.planCards.nth(2)).toContainText('Enterprise');
    });

    test('should display correct headline', async ({ onboardingPage }) => {
      const page = new OnboardingPage(onboardingPage);
      await page.waitForStep(6);

      await expect(page.headline).toContainText('Choose your');
    });

    test('should show Subscribe buttons for Pro and Scale', async ({
      onboardingPage,
    }) => {
      const page = new OnboardingPage(onboardingPage);
      await page.waitForStep(6);

      const proSubscribe = page.planCards
        .filter({ hasText: 'Pro' })
        .locator('button', { hasText: 'Subscribe' });
      const scaleSubscribe = page.planCards
        .filter({ hasText: 'Scale' })
        .locator('button', { hasText: 'Subscribe' });

      await expect(proSubscribe).toBeVisible();
      await expect(scaleSubscribe).toBeVisible();
    });

    test('should show Book a Call for Enterprise', async ({
      onboardingPage,
    }) => {
      const page = new OnboardingPage(onboardingPage);
      await page.waitForStep(6);

      await expect(page.bookACallLink).toBeVisible();
    });

    test('should allow exploring without subscribing', async ({
      onboardingPage,
    }) => {
      const page = new OnboardingPage(onboardingPage);
      await page.waitForStep(6);

      // The explore button text is "Skip for now — explore the platform free"
      const exploreLink = onboardingPage.locator('button', {
        hasText: 'Skip for now',
      });
      await expect(exploreLink).toBeVisible();
    });
  });

  // --------------------------------------------------------------------------
  // Navigation
  // --------------------------------------------------------------------------

  test.describe('Navigation', () => {
    test('should show correct step number in badge on step 1', async ({
      onboardingPage,
    }) => {
      const page = new OnboardingPage(onboardingPage);
      await page.assertOnStep(1);
    });

    test('should support back navigation from profile to account-type', async ({
      onboardingPage,
    }) => {
      const page = new OnboardingPage(onboardingPage);
      await page.waitForStep(1);
      await page.selectAccountType('Creator');
      await onboardingPage.waitForLoadState('domcontentloaded');

      await page.waitForStep(2);
      await page.clickBack();

      await expect(onboardingPage).toHaveURL(/\/onboarding\/account-type/);
    });

    test('should support back navigation from brand to profile', async ({
      onboardingPage,
    }) => {
      const page = new OnboardingPage(onboardingPage);
      // Navigate to step 3
      await page.waitForStep(1);
      await page.selectAccountType('Creator');
      await onboardingPage.waitForLoadState('domcontentloaded');
      await page.waitForStep(2);
      await page.fillProfile({ firstName: 'Test', handle: 'testuser' });
      await onboardingPage.waitForLoadState('domcontentloaded');

      await page.waitForStep(3);
      await page.clickBack();

      await expect(onboardingPage).toHaveURL(/\/onboarding\/profile/);
    });
  });
});
