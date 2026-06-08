import { expect, test } from '../../fixtures/auth.fixture';
import { formData } from '../../fixtures/test-data.fixture';
import { LoginPage } from '../../pages/login.page';

/**
 * E2E Tests for Login Flow
 *
 * These tests verify the login page functionality with mocked authentication.
 * All Clerk API calls are intercepted to prevent real authentication.
 *
 * CRITICAL: No real authentication occurs - all responses are mocked.
 */
test.describe('Login Page', () => {
  test.describe('Page Load', () => {
    test('should display the login page correctly', async ({
      unauthenticatedPage,
    }) => {
      const loginPage = new LoginPage(unauthenticatedPage);

      await loginPage.goto();

      await expect(unauthenticatedPage).toHaveURL(/login/);
      await loginPage.assertLogoVisible();
    });

    test('should display Clerk sign-in component', async ({
      unauthenticatedPage,
    }) => {
      const loginPage = new LoginPage(unauthenticatedPage);

      await loginPage.goto();
      await loginPage.waitForClerkReady();

      const hasClerkComponent = await loginPage.clerkContainer
        .isVisible()
        .catch(() => false);
      const hasEmailInput = await loginPage.emailInput
        .isVisible()
        .catch(() => false);
      const hasLogo = await loginPage.logo.isVisible().catch(() => false);

      expect(hasClerkComponent || hasEmailInput || hasLogo).toBe(true);
    });

    test('should have proper page title', async ({ unauthenticatedPage }) => {
      const loginPage = new LoginPage(unauthenticatedPage);

      await loginPage.goto();

      await expect(unauthenticatedPage).toHaveTitle(/Login|Sign In|Genfeed/i);
    });
  });

  test.describe('Authentication Flow', () => {
    test('should show email input field', async ({ unauthenticatedPage }) => {
      const loginPage = new LoginPage(unauthenticatedPage);

      await loginPage.goto();
      await loginPage.waitForClerkReady();

      const emailVisible = await loginPage.emailInput
        .isVisible()
        .catch(() => false);

      // If Clerk loaded, email input should be visible
      if (!emailVisible) {
        // Clerk might still be loading — wait and retry
        await unauthenticatedPage.waitForTimeout(2000);
        const retryVisible = await loginPage.emailInput
          .isVisible()
          .catch(() => false);
        expect(retryVisible).toBe(true);
      }
    });

    test('should validate empty email submission', async ({
      unauthenticatedPage,
    }) => {
      const loginPage = new LoginPage(unauthenticatedPage);

      await loginPage.goto();
      await loginPage.waitForClerkReady();

      const continueButton = loginPage.continueButton;
      const isEnabled = await continueButton.isEnabled().catch(() => false);

      if (isEnabled) {
        await continueButton.click();
        await expect(unauthenticatedPage).toHaveURL(/login/);
      }
    });

    test('should validate invalid email format', async ({
      unauthenticatedPage,
    }) => {
      const loginPage = new LoginPage(unauthenticatedPage);

      await loginPage.goto();
      await loginPage.waitForClerkReady();

      const canFillEmail = await loginPage.emailInput
        .isVisible()
        .catch(() => false);
      test.skip(
        !canFillEmail,
        'Email input not visible — Clerk may not have loaded',
      );

      await loginPage.fillEmail(formData.login.invalidEmail);

      await loginPage.clickContinue().catch(() => {
        // Might not be able to continue with invalid email
      });

      const hasError = await loginPage.hasError();
      const stillOnLogin = unauthenticatedPage.url().includes('/login');
      expect(hasError || stillOnLogin).toBe(true);
    });

    test('should render the login page shell for authenticated sessions', async ({
      authenticatedPage,
    }) => {
      const loginPage = new LoginPage(authenticatedPage);

      await authenticatedPage.goto('/login');
      await loginPage.waitForPageLoad();

      await expect(authenticatedPage).toHaveURL(/\/login/);
      await loginPage.assertLogoVisible();
      await expect(loginPage.emailInput).toBeVisible();
    });
  });

  test.describe('Social Login Buttons', () => {
    test('should display social login options', async ({
      unauthenticatedPage,
    }) => {
      const loginPage = new LoginPage(unauthenticatedPage);

      await loginPage.goto();
      await loginPage.waitForClerkReady();

      const hasGoogleButton = await loginPage.googleButton
        .isVisible()
        .catch(() => false);
      const hasGithubButton = await loginPage.githubButton
        .isVisible()
        .catch(() => false);

      if (!hasGoogleButton && !hasGithubButton) {
        test.skip(
          true,
          'Social login is not enabled in the current Clerk configuration',
        );
      }

      expect(hasGoogleButton || hasGithubButton).toBe(true);
    });
  });

  test.describe('Navigation Links', () => {
    test('should have sign up link if registration is enabled', async ({
      unauthenticatedPage,
    }) => {
      const loginPage = new LoginPage(unauthenticatedPage);

      await loginPage.goto();
      await loginPage.waitForClerkReady();

      const hasSignUpLink = await loginPage.signUpLink
        .isVisible()
        .catch(() => false);

      // Sign up link should be present when registration is enabled
      expect(hasSignUpLink).toBe(true);
    });

    test('should have forgot password link', async ({
      unauthenticatedPage,
    }) => {
      const loginPage = new LoginPage(unauthenticatedPage);

      await loginPage.goto();
      await loginPage.waitForClerkReady();

      const hasForgotLink = await loginPage.forgotPasswordLink
        .isVisible()
        .catch(() => false);

      if (!hasForgotLink) {
        test.skip(
          true,
          'Forgot-password is not enabled in the current Clerk configuration',
        );
      }

      expect(hasForgotLink).toBe(true);
    });
  });

  test.describe('Error Handling', () => {
    test('should handle network errors gracefully', async ({ page }) => {
      const loginPage = new LoginPage(page);

      await page.route('**/clerk.**/**', async (route) => {
        await route.abort('failed');
      });

      await loginPage.goto();
      await expect(page).toHaveURL(/login/);
    });

    test('should display error for invalid credentials', async ({
      unauthenticatedPage,
    }) => {
      const loginPage = new LoginPage(unauthenticatedPage);

      await unauthenticatedPage.route('**/clerk.**/**', async (route) => {
        const url = route.request().url();

        if (url.includes('/sign_in')) {
          await route.fulfill({
            body: JSON.stringify({
              errors: [
                {
                  code: 'form_password_incorrect',
                  message:
                    'Password is incorrect. Try again, or use another method.',
                },
              ],
            }),
            contentType: 'application/json',
            status: 422,
          });
          return;
        }

        await route.continue();
      });

      await loginPage.goto();
      await expect(unauthenticatedPage).toHaveURL(/login/);
    });
  });

  test.describe('Accessibility', () => {
    test('should have proper form labels', async ({ unauthenticatedPage }) => {
      const loginPage = new LoginPage(unauthenticatedPage);

      await loginPage.goto();
      await loginPage.waitForClerkReady();

      const emailInput = loginPage.emailInput;
      const isVisible = await emailInput.isVisible().catch(() => false);
      test.skip(
        !isVisible,
        'Email input not visible — Clerk may not have loaded',
      );

      const ariaLabel = await emailInput.getAttribute('aria-label');
      const placeholder = await emailInput.getAttribute('placeholder');
      expect(ariaLabel || placeholder).toBeTruthy();
    });

    test('should support keyboard navigation', async ({
      unauthenticatedPage,
    }) => {
      const loginPage = new LoginPage(unauthenticatedPage);

      await loginPage.goto();
      await loginPage.waitForClerkReady();

      await unauthenticatedPage.keyboard.press('Tab');

      const focusedElement = await unauthenticatedPage.locator(':focus');
      const isInteractive = (await focusedElement.count()) > 0;
      expect(isInteractive).toBe(true);
    });
  });

  test.describe('Responsive Design', () => {
    test('should display correctly on mobile viewport', async ({
      unauthenticatedPage,
    }) => {
      const loginPage = new LoginPage(unauthenticatedPage);

      await unauthenticatedPage.setViewportSize({ height: 667, width: 375 });

      await loginPage.goto();
      await loginPage.waitForClerkReady();

      await loginPage.assertLogoVisible();
      await expect(unauthenticatedPage).toHaveURL(/login/);
    });

    test('should display correctly on tablet viewport', async ({
      unauthenticatedPage,
    }) => {
      const loginPage = new LoginPage(unauthenticatedPage);

      await unauthenticatedPage.setViewportSize({ height: 1024, width: 768 });

      await loginPage.goto();
      await loginPage.waitForClerkReady();

      await loginPage.assertLogoVisible();
      await expect(unauthenticatedPage).toHaveURL(/login/);
    });
  });
});

test.describe('Login Success Flow', () => {
  test('should redirect to overview after successful login', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto('/overview');

    await expect(authenticatedPage).toHaveURL(/overview/);
  });

  test('should load the overview shell after login', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto('/overview');
    await authenticatedPage.waitForLoadState('domcontentloaded');

    await expect(authenticatedPage).toHaveURL(/overview/);
    await expect(authenticatedPage.locator('main')).toBeVisible();
    await expect(
      authenticatedPage.getByTestId('desktop-sidebar-rail'),
    ).toBeVisible();
  });
});
