import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { expect, test } from '../../fixtures/auth.fixture';
import { assertRouteRenders, tryClick } from '../../utils/route-assertions';

/**
 * Public + Managed-Credits Route Coverage
 *
 * Covers the unauthenticated public routes and the authenticated
 * managed-credits success screen. Public routes must render without bouncing
 * to login. Retired routes that now gate get their own redirect assertion.
 */

test.describe('Public Routes (Unauthenticated)', () => {
  test.setTimeout(60_000);

  const routes = [
    '/sign-up',
    '/forgot-password',
    '/reset-password',
    '/agent-auth/claim',
    '/oauth/consent',
  ];

  for (const route of routes) {
    test(`renders ${route}`, async ({ unauthenticatedPage }) => {
      await assertRouteRenders(unauthenticatedPage, route);
    });
  }

  test('retired request-access redirects to login', async ({
    unauthenticatedPage,
  }) => {
    await unauthenticatedPage.goto('/request-access', {
      waitUntil: 'domcontentloaded',
    });
    await expect(unauthenticatedPage).toHaveURL(/\/login/);
    expect(unauthenticatedPage.url()).toContain(
      encodeURIComponent('/request-access'),
    );
  });

  test('sign-up stays interactive', async ({ unauthenticatedPage }) => {
    await assertRouteRenders(unauthenticatedPage, APP_ROUTES.SIGN_UP);
    const magicLink = unauthenticatedPage.getByRole('link', {
      name: 'Magic Link',
    });
    await expect(magicLink).toBeVisible();
    await magicLink.click();
    await expect(unauthenticatedPage).not.toHaveURL(/\/login/);
    await expect(
      unauthenticatedPage.getByText(/sign up with a magic link/i),
    ).toBeVisible();
  });

  test('forgot-password stays interactive', async ({ unauthenticatedPage }) => {
    await assertRouteRenders(unauthenticatedPage, '/forgot-password');
    await unauthenticatedPage.getByLabel('Email').fill('qa@example.com');
    const sendLink = unauthenticatedPage.getByRole('button', {
      name: 'Send link',
    });
    await expect(sendLink).toBeEnabled();
    await sendLink.click();
    await expect(unauthenticatedPage).not.toHaveURL(/\/login/);
    expect(new URL(unauthenticatedPage.url()).pathname).toBe(
      '/forgot-password',
    );
    await expect(
      unauthenticatedPage.getByText(/check your email|reset your password/i),
    ).toBeVisible();
  });

  test('agent-auth claim stays interactive', async ({
    unauthenticatedPage,
  }) => {
    const claimAttemptToken = 'a'.repeat(32);
    const claimPath = `/agent-auth/claim?claim_attempt_token=${claimAttemptToken}`;
    await assertRouteRenders(unauthenticatedPage, claimPath);
    const signIn = unauthenticatedPage.getByRole('link', {
      name: 'Sign in to continue',
    });
    await expect(signIn).toBeVisible();
    await signIn.click();
    await expect(unauthenticatedPage).toHaveURL(/\/login/);
    expect(unauthenticatedPage.url()).toContain(
      encodeURIComponent(`/agent-auth/claim?claim_attempt_token=`),
    );
  });
});

test.describe('Connect (Authenticated)', () => {
  test.setTimeout(60_000);

  test('renders /connect', async ({ authenticatedPage }) => {
    await assertRouteRenders(authenticatedPage, APP_ROUTES.CONNECT);
  });
});

test.describe('Managed Credits (Authenticated)', () => {
  test.setTimeout(60_000);

  test('renders /managed-credits/success', async ({ authenticatedPage }) => {
    await assertRouteRenders(
      authenticatedPage,
      APP_ROUTES.MANAGED_CREDITS_SUCCESS,
    );
  });

  test('managed-credits success stays interactive', async ({
    authenticatedPage,
  }) => {
    await assertRouteRenders(
      authenticatedPage,
      APP_ROUTES.MANAGED_CREDITS_SUCCESS,
    );
    const clicked = await tryClick(authenticatedPage, 'a');
    expect(clicked).toBe(true);
    await expect(authenticatedPage.locator('body')).toBeVisible();
  });
});
