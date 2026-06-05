import { expect, test } from '../../fixtures/auth.fixture';

/**
 * Quick validation that auth fixtures work correctly
 * This test validates the mock setup without requiring the full app
 */
test.describe('Auth Fixture Validation', () => {
  test('should have Clerk API mocks set up for authenticated page', async ({
    authenticatedPage,
  }) => {
    // Check that cookies are set
    const cookies = await authenticatedPage.context().cookies();
    const sessionCookie = cookies.find((c) => c.name === '__session');
    const clientUatCookie = cookies.find((c) => c.name === '__client_uat');
    const jwtCookie = cookies.find((c) => c.name === '__clerk_db_jwt');

    expect(sessionCookie).toBeDefined();
    expect(clientUatCookie).toBeDefined();
    expect(jwtCookie).toBeDefined();

    console.log('✓ Cookies are set correctly');
  });

  test('should have localStorage with auth state', async ({
    authenticatedPage,
  }) => {
    // Check localStorage
    const clerkJwt = await authenticatedPage.evaluate(() =>
      localStorage.getItem('__clerk_client_jwt'),
    );
    const clerkClient = await authenticatedPage.evaluate(() =>
      localStorage.getItem('__clerk_client'),
    );

    expect(clerkJwt).toBeTruthy();
    expect(clerkClient).toBeTruthy();

    console.log('✓ localStorage auth state is set');
  });

  test('should have window auth state injected', async ({
    authenticatedPage,
  }) => {
    const hasAuthState = await authenticatedPage.evaluate(() => {
      return !!(window as any).__clerk_client_state;
    });

    const isSignedIn = await authenticatedPage.evaluate(() => {
      return (window as any).__clerk_is_signed_in;
    });

    expect(hasAuthState).toBe(true);
    expect(isSignedIn).toBe(true);

    console.log('✓ Window auth state is injected');
  });
});
