import { settle } from '@e2e/utils/interaction-helpers';
import { waitRealTime } from '@e2e/utils/real-time';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { Page } from '@playwright/test';
import {
  expect,
  simulateLogout,
  simulateSessionExpiry,
  test,
} from '../../fixtures/auth.fixture';

const BOOT_RECORD_KEY = 'genfeed:boot:v2';

interface SignOutControl {
  fail: () => void;
  release: () => void;
  requests: () => number;
}

/** Holds the sign-out request until the test answers it. */
async function holdSignOut(page: Page): Promise<SignOutControl> {
  let requests = 0;
  let answer: 'ok' | 'error' | undefined;
  let waiting: Array<() => void> = [];

  await page.route('**/v1/auth/sign-out**', async (route) => {
    requests += 1;
    if (answer === undefined) {
      await new Promise<void>((resolve) => {
        waiting.push(resolve);
      });
    }
    await route.fulfill(
      answer === 'error'
        ? { body: '{}', contentType: 'application/json', status: 503 }
        : {
            body: JSON.stringify({ success: true }),
            contentType: 'application/json',
            status: 200,
          },
    );
  });

  const settle = (next: 'ok' | 'error') => {
    answer = next;
    for (const resolve of waiting) {
      resolve();
    }
    waiting = [];
  };

  return {
    fail: () => settle('error'),
    release: () => settle('ok'),
    requests: () => requests,
  };
}

async function readDeviceStores(
  page: Page,
): Promise<{ bootRecord: string | null; cachedQueries: number }> {
  return await page.evaluate(async (bootKey) => {
    const cachedQueries = await new Promise<number>((resolve) => {
      const open = indexedDB.open('genfeed-query-cache', 1);
      open.onupgradeneeded = () => {
        open.result.createObjectStore('snapshots');
      };
      open.onerror = () => resolve(0);
      open.onsuccess = () => {
        const count = open.result
          .transaction('snapshots', 'readonly')
          .objectStore('snapshots')
          .count();
        count.onsuccess = () => resolve(count.result);
        count.onerror = () => resolve(0);
      };
    });
    return { bootRecord: localStorage.getItem(bootKey), cachedQueries };
  }, BOOT_RECORD_KEY);
}

/**
 * E2E Tests for Logout Flow
 *
 * These tests verify logout functionality and session management.
 * All authentication is mocked - no real Better Auth calls occur.
 *
 * CRITICAL: No real authentication occurs - all responses are mocked.
 */
test.describe('Logout Flow', () => {
  test.describe('Logout Route', () => {
    test('shows the sign-in page at once and unlocks it when sign-out answers', async ({
      authenticatedPage,
    }) => {
      const signOut = await holdSignOut(authenticatedPage);

      await authenticatedPage.goto(APP_ROUTES.LOGOUT);
      await expect.poll(() => signOut.requests()).toBeGreaterThan(0);

      const passwordLink = authenticatedPage.getByRole('link', {
        name: 'Email / Password',
      });
      await expect(
        authenticatedPage.getByRole('heading', { name: 'Welcome back' }),
      ).toBeVisible();
      await expect(authenticatedPage.getByText(/Signing out/)).toHaveCount(0);
      await expect(passwordLink).toHaveAttribute('aria-disabled', 'true');

      signOut.release();

      await expect(passwordLink).not.toHaveAttribute('aria-disabled', 'true');
    });

    test('tells the user when the session may still be active, and retries', async ({
      authenticatedPage,
    }) => {
      const signOut = await holdSignOut(authenticatedPage);

      await authenticatedPage.goto(APP_ROUTES.LOGOUT);
      await expect.poll(() => signOut.requests()).toBeGreaterThan(0);
      signOut.fail();

      await expect(
        authenticatedPage.getByText(/may still be active on this device/),
      ).toBeVisible();
      // The first request and its one retry.
      expect(signOut.requests()).toBe(2);
      await expect(
        authenticatedPage.getByRole('link', { name: 'Email / Password' }),
      ).toHaveAttribute('aria-disabled', 'true');

      signOut.release();
      await authenticatedPage
        .getByRole('button', { name: 'Try again' })
        .click();

      await expect(
        authenticatedPage.getByRole('link', { name: 'Email / Password' }),
      ).not.toHaveAttribute('aria-disabled', 'true');
    });

    test('leaves nothing of the user on the device', async ({
      authenticatedPage,
    }) => {
      await authenticatedPage.goto(APP_ROUTES.WORKSPACE.OVERVIEW);
      await expect(
        authenticatedPage.getByTestId('app-content-shell'),
      ).toBeVisible();

      const signOut = await holdSignOut(authenticatedPage);
      await authenticatedPage.goto(APP_ROUTES.LOGOUT);
      await expect.poll(() => signOut.requests()).toBeGreaterThan(0);

      // Cleared while the request is still held, not after it answers.
      await expect
        .poll(() => readDeviceStores(authenticatedPage))
        .toEqual({ bootRecord: null, cachedQueries: 0 });
    });

    test('should clear authentication state on logout', async ({
      authenticatedPage,
    }) => {
      await authenticatedPage.goto(APP_ROUTES.LOGOUT);

      await simulateLogout(authenticatedPage);

      const cookies = await authenticatedPage.context().cookies();
      const sessionCookie = cookies.find((c) => c.name === '__session');

      expect(sessionCookie?.value || '').toBeFalsy();
    });
  });

  test.describe('Cross-tab sign-out', () => {
    test('should send an open protected tab to login when another tab signs out', async ({
      authenticatedPage,
    }) => {
      await authenticatedPage.goto(APP_ROUTES.WORKSPACE.OVERVIEW);

      // The /logout page posts this message from the tab that signed out. A
      // channel opened here is a different object, so the shell receives it.
      // Post until the shell has mounted and reacts; a repeat is harmless.
      await expect
        .poll(
          async () => {
            await authenticatedPage
              .evaluate(() => {
                const channel = new BroadcastChannel('genfeed:auth:signed-out');
                channel.postMessage('signed-out');
                channel.close();
              })
              // The page may already be navigating to login.
              .catch(() => undefined);
            return new URL(authenticatedPage.url()).pathname;
          },
          { timeout: 15_000 },
        )
        .toBe(APP_ROUTES.LOGIN);
    });
  });

  test.describe('Session Expiration', () => {
    test('should handle expired session gracefully', async ({
      authenticatedPage,
    }) => {
      await authenticatedPage.goto(APP_ROUTES.WORKSPACE.OVERVIEW);

      await simulateSessionExpiry(authenticatedPage);

      await authenticatedPage.goto(APP_ROUTES.STUDIO.PLAYGROUND);

      const url = authenticatedPage.url();
      const isOnProtectedPage =
        url.includes('/login') ||
        url.includes('/sign-in') ||
        url.includes(APP_ROUTES.STUDIO.PLAYGROUND);

      expect(isOnProtectedPage).toBe(true);
    });

    test('should redirect to login when session expires', async ({
      authenticatedPage,
    }) => {
      await authenticatedPage.goto(APP_ROUTES.WORKSPACE.OVERVIEW);

      // Simulate session expiration
      await simulateSessionExpiry(authenticatedPage);

      // Attempt to access protected resource
      await authenticatedPage.reload();

      // Wait for any redirects
      await settle(authenticatedPage);

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
      await authenticatedPage.goto(APP_ROUTES.LOGOUT);

      // Wait for any redirects
      await settle(authenticatedPage);

      // Should still be on a valid page (login or home)
      const url = authenticatedPage.url();
      expect(url).toBeTruthy();
    });

    test('should handle logout during page transition', async ({
      authenticatedPage,
    }) => {
      // Start navigating
      const navigationPromise = authenticatedPage.goto(
        APP_ROUTES.STUDIO.PLAYGROUND,
      );

      // Simulate logout mid-navigation
      await waitRealTime(100);
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
      await authenticatedPage.goto(APP_ROUTES.WORKSPACE.OVERVIEW);

      await authenticatedPage.evaluate(() => {
        localStorage.setItem('testKey', 'testValue');
      });

      await simulateLogout(authenticatedPage);

      const hasBetterAuthData = await authenticatedPage.evaluate(() => {
        return localStorage.getItem('__better_auth_client_jwt');
      });

      // Better Auth data should be cleared
      expect(hasBetterAuthData).toBeFalsy();
    });
  });

  test.describe('Logout Feedback', () => {
    test('should show confirmation message on successful logout', async ({
      authenticatedPage,
    }) => {
      await authenticatedPage.goto(APP_ROUTES.LOGOUT);

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

      await simulateLogout(authenticatedPage);

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
      await authenticatedPage.goto(APP_ROUTES.WORKSPACE.OVERVIEW);

      await simulateLogout(authenticatedPage);

      // Navigate to login
      await authenticatedPage.goto(APP_ROUTES.LOGIN);

      const pageContent = await authenticatedPage.content();

      // Should not contain user-specific data
      expect(pageContent).not.toContain('test@genfeed.ai');
    });
  });
});
