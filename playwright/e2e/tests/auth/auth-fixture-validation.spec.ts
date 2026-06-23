import { expect, test } from '../../fixtures/auth.fixture';

/**
 * Quick validation that auth fixtures work correctly
 * This test validates the mock setup without requiring the full app
 */
test.describe('Auth Fixture Validation', () => {
  test('should have Better Auth API mocks set up for authenticated page', async ({
    authenticatedPage,
  }) => {
    // Check that cookies are set
    const cookies = await authenticatedPage.context().cookies();
    const sessionCookie = cookies.find((c) => c.name === '__session');
    const clientUatCookie = cookies.find((c) => c.name === '__client_uat');
    const jwtCookie = cookies.find((c) => c.name === '__better_auth_db_jwt');

    expect(sessionCookie).toBeDefined();
    expect(clientUatCookie).toBeDefined();
    expect(jwtCookie).toBeDefined();

    console.log('✓ Cookies are set correctly');
  });

  test('should have localStorage with auth state', async ({
    authenticatedPage,
  }) => {
    // Check localStorage
    const betterAuthJwt = await authenticatedPage.evaluate(() =>
      localStorage.getItem('__better_auth_client_jwt'),
    );
    const betterAuthClient = await authenticatedPage.evaluate(() =>
      localStorage.getItem('__better_auth_client'),
    );

    expect(betterAuthJwt).toBeTruthy();
    expect(betterAuthClient).toBeTruthy();

    console.log('✓ localStorage auth state is set');
  });

  test('should have window auth state injected', async ({
    authenticatedPage,
  }) => {
    const hasAuthState = await authenticatedPage.evaluate(() => {
      return Boolean(
        (window as Window & Record<string, unknown>).__better_auth_client_state,
      );
    });

    const isSignedIn = await authenticatedPage.evaluate(() => {
      return (window as Window & Record<string, unknown>)
        .__better_auth_is_signed_in;
    });

    expect(hasAuthState).toBe(true);
    expect(isSignedIn).toBe(true);

    console.log('✓ Window auth state is injected');
  });
});
