import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { test as setup } from '@playwright/test';

/**
 * Better Auth authenticated-storage bootstrap.
 *
 * The default Playwright suite uses mocked auth fixtures. The opt-in
 * `app-authed` project can exercise the real proxy/authMiddleware path when a
 * runner supplies a valid Better Auth session token through
 * `E2E_BETTER_AUTH_SESSION_TOKEN`.
 */

const AUTH_DIR = path.join(
  process.cwd(),
  'playwright',
  'artifacts',
  '.better-auth',
);
const USER_AUTH_FILE = path.join(AUTH_DIR, 'user.json');
const ADMIN_AUTH_FILE = path.join(AUTH_DIR, 'admin.json');

function buildStorageState(token: string) {
  const appBaseUrl =
    process.env.APP_BASE_URL || process.env.BASE_URL || 'http://127.0.0.1:3000';
  const url = new URL(appBaseUrl);
  const secure = url.protocol === 'https:';

  return {
    cookies: [
      {
        domain: url.hostname,
        expires: -1,
        httpOnly: true,
        name: secure
          ? '__Secure-better-auth.session_token'
          : 'better-auth.session_token',
        path: '/',
        sameSite: 'Lax',
        secure,
        value: token,
      },
    ],
    origins: [],
  };
}

setup('prepare Better Auth storage state', async () => {
  const sessionToken = process.env.E2E_BETTER_AUTH_SESSION_TOKEN?.trim();
  if (!sessionToken) {
    throw new Error(
      'E2E_BETTER_AUTH_SESSION_TOKEN is required when the app-authed Playwright project is enabled.',
    );
  }

  mkdirSync(AUTH_DIR, { recursive: true });
  const storageState = JSON.stringify(buildStorageState(sessionToken), null, 2);
  writeFileSync(USER_AUTH_FILE, storageState);
  writeFileSync(ADMIN_AUTH_FILE, storageState);
});
