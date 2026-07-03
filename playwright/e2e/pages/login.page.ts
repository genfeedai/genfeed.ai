import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';

/**
 * Page Object Model for the Login Page
 *
 * Provides an abstraction layer for interacting with the login page during E2E tests.
 * Handles the local Better Auth login flow.
 *
 * @module login.page
 */
export class LoginPage {
  readonly page: Page;
  readonly url = '/login';

  // Better Auth login form selectors
  readonly betterAuthContainer: Locator;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly continueButton: Locator;
  readonly signInButton: Locator;

  // Logo and branding
  readonly logo: Locator;

  // Social login buttons
  readonly googleButton: Locator;

  // Error messages
  readonly errorMessage: Locator;

  // Links
  readonly signUpLink: Locator;
  readonly forgotPasswordLink: Locator;

  constructor(page: Page) {
    this.page = page;

    // Main container
    this.betterAuthContainer = page.locator(
      'form:has(input[type="email"]):visible',
    );

    // Form inputs
    this.emailInput = page.locator('input[type="email"]:visible');
    this.passwordInput = page.locator(
      'input[name="password"]:visible, input[type="password"]:visible',
    );

    // Buttons
    this.continueButton = page.locator(
      'button:has-text("Continue"), [data-localization-key="formButtonPrimary"]',
    );
    this.signInButton = page.locator(
      'button:has-text("Sign in"), button:has-text("Log in")',
    );

    // Logo
    this.logo = page.locator('img[alt*="Genfeed"], img[alt*="logo"]');

    // Social login
    this.googleButton = page.locator(
      'button:has-text("Google"), [data-localization-key="socialButtonsBlockButton__google"]',
    );

    // Error messages
    this.errorMessage = page.locator('[role="alert"], .text-destructive');

    // Links
    this.signUpLink = page.locator(
      'a:has-text("Sign up"), a:has-text("Create account")',
    );
    this.forgotPasswordLink = page.locator(
      'a:has-text("Forgot password"), button:has-text("Forgot password")',
    );
  }

  /**
   * Navigate to the login page
   */
  async goto(): Promise<void> {
    await this.page.goto(this.url);
    await this.waitForPageLoad();
  }

  /**
   * Wait for the login page to fully load
   */
  async waitForPageLoad(): Promise<void> {
    await this.page.waitForLoadState('domcontentloaded');

    // Wait for either Better Auth component or custom login form
    await Promise.race([
      this.betterAuthContainer.waitFor({ state: 'visible', timeout: 10000 }),
      this.emailInput.waitFor({ state: 'visible', timeout: 10000 }),
    ]).catch(() => {
      // Page might redirect if already authenticated
    });
  }

  /**
   * Check if the login page is displayed
   */
  async isDisplayed(): Promise<boolean> {
    const url = this.page.url();
    const hasLoginPath = url.includes('/login');
    const hasEmailInput = await this.emailInput.isVisible().catch(() => false);
    const hasBetterAuthComponent = await this.betterAuthContainer
      .isVisible()
      .catch(() => false);

    return hasLoginPath && (hasEmailInput || hasBetterAuthComponent);
  }

  /**
   * Fill the email field
   */
  async fillEmail(email: string): Promise<void> {
    await this.emailInput.fill(email);
  }

  /**
   * Fill the password field
   */
  async fillPassword(password: string): Promise<void> {
    await this.passwordInput.fill(password);
  }

  /**
   * Click the continue button (for multi-step login)
   */
  async clickContinue(): Promise<void> {
    await this.continueButton.click();
    await this.page.waitForLoadState('domcontentloaded');
  }

  /**
   * Click the sign in button
   */
  async clickSignIn(): Promise<void> {
    const button = this.signInButton.or(this.continueButton);
    await button.click();
    await this.page.waitForLoadState('domcontentloaded');
  }

  /**
   * Perform a complete login with email and password
   */
  async login(email: string, password: string): Promise<void> {
    await this.fillEmail(email);
    await this.clickContinue();

    // Wait for password field to appear (Better Auth uses multi-step flow)
    await this.passwordInput
      .waitFor({ state: 'visible', timeout: 5000 })
      .catch(() => {
        // Some flows might have password on same page
      });

    await this.fillPassword(password);
    await this.clickSignIn();
  }

  /**
   * Click Google sign in button
   */
  async loginWithGoogle(): Promise<void> {
    await this.googleButton.click();
  }

  /**
   * Click forgot password link
   */
  async clickForgotPassword(): Promise<void> {
    await this.forgotPasswordLink.click();
  }

  /**
   * Click sign up link
   */
  async clickSignUp(): Promise<void> {
    await this.signUpLink.click();
  }

  /**
   * Check if an error message is displayed
   */
  async hasError(): Promise<boolean> {
    return await this.errorMessage.isVisible();
  }

  /**
   * Get the error message text
   */
  async getErrorText(): Promise<string> {
    const isVisible = await this.errorMessage.isVisible();
    if (!isVisible) {
      return '';
    }
    return (await this.errorMessage.textContent()) || '';
  }

  /**
   * Assert that login was successful (redirected away from login page)
   */
  async assertLoginSuccess(): Promise<void> {
    // Should redirect to overview or home after successful login
    await expect(this.page).not.toHaveURL(/\/login/);

    // Common post-login destinations
    const validUrls = [
      '/overview',
      '/studio',
      '/g',
      '/editor',
      '/workflows',
      '/',
    ];
    const currentUrl = this.page.url();
    const isValidRedirect = validUrls.some((url) => currentUrl.includes(url));

    expect(isValidRedirect).toBe(true);
  }

  /**
   * Assert that an error message is displayed
   */
  async assertError(expectedText?: string): Promise<void> {
    await expect(this.errorMessage).toBeVisible();

    if (expectedText) {
      await expect(this.errorMessage).toContainText(expectedText);
    }
  }

  /**
   * Assert that the logo is visible
   */
  async assertLogoVisible(): Promise<void> {
    await expect(this.logo).toBeVisible();
  }

  /**
   * Get all form validation errors
   */
  async getValidationErrors(): Promise<string[]> {
    const errors = await this.page
      .locator('[role="alert"], .text-destructive')
      .all();
    const errorTexts: string[] = [];

    for (const error of errors) {
      const text = await error.textContent();
      if (text) {
        errorTexts.push(text);
      }
    }

    return errorTexts;
  }

  /**
   * Wait for and handle Better Auth loading states
   */
  async waitForBetterAuthReady(): Promise<void> {
    // Wait for Better Auth loading states to complete
    const loadingSelectors = [
      '.cl-loading',
      '[data-loading="true"]',
      '.cl-spinner',
    ];

    for (const selector of loadingSelectors) {
      const loading = this.page.locator(selector);
      const isVisible = await loading.isVisible().catch(() => false);

      if (isVisible) {
        await loading.waitFor({ state: 'hidden', timeout: 10000 });
      }
    }
  }
}
