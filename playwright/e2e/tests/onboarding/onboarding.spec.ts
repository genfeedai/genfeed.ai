import { brandPath, orgPath } from '@e2e/utils/app-chrome';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { expect, test } from '../../fixtures/onboarding.fixture';
import { OnboardingPage } from '../../pages/onboarding.page';

const ONBOARDING_API_ENDPOINT = 'https://api.genfeed.ai/v1';
const AGENT_HANDOFF_PATH = orgPath(APP_ROUTES.AGENT.ONBOARDING);

/**
 * Onboarding Flow E2E Tests
 *
 * Web onboarding is agent-first: brand is the only wizard screen a cloud
 * operator is walked through, and continuing from it hands off to the
 * `/agent/onboarding` conversation. Providers and summary remain reachable as
 * their own destinations for Desktop and for operators who come back to them.
 * All API calls are mocked via onboarding.fixture.ts.
 */

test.describe('Onboarding Flow', () => {
  test('keeps onboarding progress stateful when generic user mocks also match', async ({
    onboardingPage,
  }) => {
    const progress = await onboardingPage.evaluate(
      async ({ apiEndpoint, userId }) => {
        const patchResponse = await fetch(
          `${apiEndpoint}/users/${userId}/onboarding`,
          {
            body: JSON.stringify({ onboardingStepsCompleted: ['brand'] }),
            headers: { 'Content-Type': 'application/json' },
            method: 'PATCH',
          },
        );
        const getResponse = await fetch(
          `${apiEndpoint}/users/${userId}/onboarding`,
        );

        return {
          patched: await patchResponse.json(),
          reloaded: await getResponse.json(),
        };
      },
      {
        apiEndpoint: ONBOARDING_API_ENDPOINT,
        userId: 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6',
      },
    );

    expect(progress).toEqual({
      patched: {
        isOnboardingCompleted: false,
        onboardingStepsCompleted: ['brand'],
        onboardingType: null,
        success: true,
      },
      reloaded: {
        isOnboardingCompleted: false,
        onboardingStepsCompleted: ['brand'],
        onboardingType: null,
      },
    });
  });

  test.describe('Happy Path (Full Flow)', () => {
    test('should hand off to the agent after brand, then finish the wizard tail', async ({
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

      await page.assertAgentHandoff(AGENT_HANDOFF_PATH);

      // Completing brand first is what unlocks `/workspace` at the end of this
      // spec — the guard gates on that step, not on the whole wizard.
      await page.goto('providers');
      await page.assertOnStep(2);

      await page.continueWithServerDefaults();
      await page.assertOnStep(3);

      await page.continueWithSelfHosted();
      await page.assertSuccess();

      await page.enterWorkspace();
      await expect
        .poll(() => new URL(onboardingPage.url()).pathname)
        .toBe(brandPath(APP_ROUTES.WORKSPACE.OVERVIEW));
      await expect(
        onboardingPage
          .getByTestId('desktop-sidebar-rail')
          .getByRole('link', { name: 'Dashboard' }),
      ).toBeVisible();
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

    test('should hand off to the agent with brand and organization', async ({
      onboardingPage,
    }) => {
      const page = new OnboardingPage(onboardingPage);
      await page.waitForStep(1);

      await page.fillBrand({
        brandName: 'My Test Brand',
        organizationName: 'My Test Org',
      });
      await page.clickContinue();

      await page.assertAgentHandoff(AGENT_HANDOFF_PATH);
    });

    test('should allow skipping brand setup', async ({ onboardingPage }) => {
      const page = new OnboardingPage(onboardingPage);
      await page.waitForStep(1);
      await page.skipStep();

      // Production returns to root after completing onboarding. The normal
      // request boundary resolves that root into a scoped destination; the
      // mocked-auth bypass intentionally leaves this client transition at `/`.
      await expect
        .poll(() => new URL(onboardingPage.url()).pathname)
        .toBe(APP_ROUTES.ROOT);

      const completion = await onboardingPage.evaluate(async (apiEndpoint) => {
        const response = await fetch(`${apiEndpoint}/auth/bootstrap`);
        const payload = (await response.json()) as {
          access?: { isOnboardingCompleted?: boolean };
          currentUser?: { isOnboardingCompleted?: boolean };
        };

        return {
          access: payload.access?.isOnboardingCompleted,
          currentUser: payload.currentUser?.isOnboardingCompleted,
          ok: response.ok,
        };
      }, ONBOARDING_API_ENDPOINT);

      expect(completion).toEqual({
        access: true,
        currentUser: true,
        ok: true,
      });
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

      await expect
        .poll(() => new URL(onboardingPage.url()).pathname)
        .toBe(APP_ROUTES.ONBOARDING.BRAND);
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

      await expect
        .poll(() => new URL(onboardingPage.url()).pathname)
        .toBe(APP_ROUTES.ONBOARDING.PROVIDERS);
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
