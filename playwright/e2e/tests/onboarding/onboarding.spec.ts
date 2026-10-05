import { brandPath, orgPath } from '@e2e/utils/app-chrome';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { playwrightApiEndpoint } from '../../config/environment';
import { expect, test } from '../../fixtures/onboarding.fixture';
import { OnboardingPage } from '../../pages/onboarding.page';

const ONBOARDING_API_ENDPOINT = playwrightApiEndpoint;
const AGENT_HANDOFF_PATH = orgPath(APP_ROUTES.AGENT.ONBOARDING);

/** Brand guide review, explicit handoff and the reachable wizard tail. */

test.describe('Onboarding Flow', () => {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    test(`keeps the website scan controls compact at ${viewport.width}px`, async ({
      personalInboxOnboardingPage,
    }, testInfo) => {
      await personalInboxOnboardingPage.setViewportSize(viewport);
      await personalInboxOnboardingPage.emulateMedia({
        reducedMotion: 'reduce',
      });
      const wizard = new OnboardingPage(personalInboxOnboardingPage);
      await wizard.waitForBrandGuide();

      await expect(
        personalInboxOnboardingPage.locator('body'),
      ).toHaveJSProperty('scrollWidth', viewport.width);

      const scanBounds = await wizard.scanButton.boundingBox();
      expect(scanBounds).not.toBeNull();
      expect(
        (scanBounds?.y ?? Infinity) + (scanBounds?.height ?? Infinity),
      ).toBeLessThan(viewport.height);

      await personalInboxOnboardingPage.screenshot({
        path: testInfo.outputPath(`brand-website-scan-${viewport.width}.png`),
        fullPage: true,
      });
    });
  }

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

      // A work-domain signup suggests a website; the operator approves the guide.
      await page.approveAndContinueBrand();
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
    test('should hand off to the agent for a work-domain signup', async ({
      onboardingPage,
    }) => {
      // Website scanning starts during fixture navigation.
      const page = new OnboardingPage(onboardingPage);

      await page.approveAndContinueBrand();
      await page.assertAgentHandoff(AGENT_HANDOFF_PATH);
    });

    test('should scan a personal inbox website and require guide approval before continuing', async ({
      personalInboxOnboardingPage,
    }) => {
      const page = new OnboardingPage(personalInboxOnboardingPage);

      await page.waitForBrandGuide();
      await expect(page.websiteUrlInput).toHaveValue('');
      const releaseScan = await page.holdWebsiteScan();
      try {
        await page.scanWebsite('acme-studio.com');
        await page.assertScanPending();
      } finally {
        releaseScan();
      }
      await expect(
        personalInboxOnboardingPage
          .getByRole('status')
          .filter({ hasText: 'Website details are ready to review.' }),
      ).toBeVisible();
      await page.approveAndContinueBrand();
      await page.assertAgentHandoff(AGENT_HANDOFF_PATH);
    });

    test('should allow skipping brand setup', async ({
      personalInboxOnboardingPage: onboardingPage,
    }) => {
      // Skip remains available without approving the guide.
      const page = new OnboardingPage(onboardingPage);
      await page.waitForBrandGuide();
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
});
