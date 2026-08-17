import { test } from '@playwright/test';

/**
 * Mocked app-core (full-tier / nightly) builds with
 * NEXT_PUBLIC_PLAYWRIGHT_TEST or PLAYWRIGHT_TEST skip Better Auth in proxy.ts.
 * Unauthenticated login-redirect specs cannot pass there; they belong on
 * e2e-frontend-authed.
 */
export function isPlaywrightAuthBypassed(): boolean {
  return (
    process.env.NEXT_PUBLIC_PLAYWRIGHT_TEST === 'true' ||
    process.env.PLAYWRIGHT_TEST === 'true'
  );
}

export const PLAYWRIGHT_AUTH_BYPASS_SKIP =
  'Mocked app-core builds skip Better Auth; login redirect is covered by e2e-frontend-authed.';

export function skipIfPlaywrightAuthBypassed(): void {
  test.skip(isPlaywrightAuthBypassed(), PLAYWRIGHT_AUTH_BYPASS_SKIP);
}
