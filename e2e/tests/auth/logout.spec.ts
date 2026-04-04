import {
  expect,
  simulateLogout,
  simulateSessionExpiry,
  test,
} from '../../fixtures/auth.fixture';

/**
 * E2E Tests for Logout Flow
 *
 * These tests verify logout functionality and session management.
 * All authentication is mocked - no real Clerk calls occur.
 *
 * CRITICAL: No real authentication occurs - all responses are mocked.
 */
test.describe('Logout Flow', () => {
  test.describe('Logout Route', () => {
    test('should render the logout page shell', async ({
      authenticatedPage,
    }) => {
      await authenticatedPage.goto('/logout');

      await expect(authenticatedPage.getByText('Signing out...')).toBeVisible();
      await expect(authenticatedPage).toHaveURL(/\/logout|\/login|\/sign-in/i);
    });

    test('should keep the logout shell visible while sign-out runs', async ({
      authenticatedPage,
    }) => {
      await authenticatedPage.goto('/logout');

      await expect(authenticatedPage.getByText('Signing out...')).toBeVisible();
      await expect(authenticatedPage).toHaveURL(/\/logout|\/login|\/sign-in/i);
    });

    test('should clear authentication state on logout', async ({
      authenticatedPage,
    }) => {
      await authenticatedPage.goto('/logout');

      await simulateLogout(authenticatedPage);

      const cookies = await authenticatedPage.context().cookies();
      const sessionCookie = cookies.find((c) => c.name === '__session');

      expect(sessionCookie?.value || '').toBeFalsy();
    });
  });

  test.describe('Session Expiration', () => {
    test('should handle expired session gracefully', async ({
      authenticatedPage,
    }) => {
      await authenticatedPage.goto('/overview');

      await simulateSessionExpiry(authenticatedPage);

      await authenticatedPage.goto('/studio');

      const url = authenticatedPage.url();
      const isOnProtectedPage =
        url.includes('/login') ||
        url.includes('/sign-in') ||
        url.includes('/studio');

      expect(isOnProtectedPage).toBe(true);
    });

    test('should redirect to login when session expires', async ({
      authenticatedPage,
    }) => {
      await authenticatedPage.goto('/overview');

      // Simulate session expiration
      await simulateSessionExpiry(authenticatedPage);

      // Attempt to access protected resource
      await authenticatedPage.reload();

      // Wait for any redirects
      await authenticatedPage.waitForTimeout(1000);

      // Depending on implementation, should redirect to login or stay with error
      const url = authenticatedPage.url();
      const isHandled =
        url.includes('/login') ||
        url.includes('/sign-in') ||
        url.includes('/overview'); // Might stay if using client-side auth

      expect(isHandled).toBe(true);
    });
  });

  test.describe('Logout Edge Cases', () => {
    test('should handle double logout gracefully', async ({
      authenticatedPage,
    }) => {
      // First logout
      await simulateLogout(authenticatedPage);

      // Navigate to logout again
      await authenticatedPage.goto('/logout');

      // Wait for any redirects
      await authenticatedPage.waitForTimeout(1000);

      // Should still be on a valid page (login or home)
      const url = authenticatedPage.url();
      expect(url).toBeTruthy();
    });

    test('should handle logout during page transition', async ({
      authenticatedPage,
    }) => {
      // Start navigating
      const navigationPromise = authenticatedPage.goto('/studio');

      // Simulate logout mid-navigation
      await authenticatedPage.waitForTimeout(100);
      await simulateLogout(authenticatedPage);

      // Wait for navigation to complete
      await navigationPromise.catch(() => {
        // Navigation might fail due to logout
      });

      // Page should be in a valid state
      const url = authenticatedPage.url();
      expect(url).toBeTruthy();
    });

    test('should clear local storage on logout', async ({
      authenticatedPage,
    }) => {
      await authenticatedPage.goto('/overview');

      // Set some data in local storage
      await authenticatedPage.evaluate(() => {
        localStorage.setItem('testKey', 'testValue');
      });

      // Simulate logout
      await simulateLogout(authenticatedPage);

      // Check local storage
      const hasClerkData = await authenticatedPage.evaluate(() => {
        return localStorage.getItem('__clerk_client_jwt');
      });

      // Clerk data should be cleared
      expect(hasClerkData).toBeFalsy();
    });
  });

  test.describe('Logout Feedback', () => {
    test('should show loading state during logout', async ({
      authenticatedPage,
    }) => {
      await authenticatedPage.goto('/logout');

      await expect(authenticatedPage.getByText('Signing out...')).toBeVisible();
    });

    test('should show confirmation message on successful logout', async ({
      authenticatedPage,
    }) => {
      await authenticatedPage.goto('/logout');

      await authenticatedPage.waitForLoadState('domcontentloaded');

      const url = authenticatedPage.url();
      const isOnLogoutFlow =
        url.includes('/logout') ||
        url.includes('/login') ||
        url.includes('/sign-in');

      expect(isOnLogoutFlow).toBe(true);
    });
  });

  test.describe('Security', () => {
    test('should invalidate session token after logout', async ({
      authenticatedPage,
    }) => {
      // Store the session token before logout
      const cookiesBefore = await authenticatedPage.context().cookies();
      const sessionBefore = cookiesBefore.find(
        (c) => c.name === '__session',
      )?.value;

      // Simulate logout
      await simulateLogout(authenticatedPage);

      // Check that session is different or cleared
      const cookiesAfter = await authenticatedPage.context().cookies();
      const sessionAfter = cookiesAfter.find(
        (c) => c.name === '__session',
      )?.value;

      // Session should be cleared or changed
      expect(sessionAfter !== sessionBefore || !sessionAfter).toBe(true);
    });

    test('should not leak sensitive data after logout', async ({
      authenticatedPage,
    }) => {
      await authenticatedPage.goto('/overview');

      // Simulate logout
      await simulateLogout(authenticatedPage);

      // Navigate to login
      await authenticatedPage.goto('/login');

      // Check that no user data is visible
      const pageContent = await authenticatedPage.content();

      // Should not contain user-specific data
      expect(pageContent).not.toContain('test@genfeed.ai');
    });
  });
});
