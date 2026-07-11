import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { test as setup } from '@playwright/test';

/**
 * Better Auth authenticated-storage bootstrap.
 *
 * Hermetic by default: mints a fresh session against the job-local API
 * (sign-up → session cookie → onboarding completion), so CI needs no
 * long-lived credentials and never touches production (#1448). A pre-minted
 * token can still be supplied via `E2E_BETTER_AUTH_SESSION_TOKEN` for local
 * runs against an already-authenticated dev stack (`E2E_AUTHED_LOCAL=1`).
 */

const AUTH_DIR = path.join(
  process.cwd(),
  'playwright',
  'artifacts',
  '.better-auth',
);
const USER_AUTH_FILE = path.join(AUTH_DIR, 'user.json');
const ADMIN_AUTH_FILE = path.join(AUTH_DIR, 'admin.json');

const SESSION_COOKIE_NAMES = [
  'better-auth.session_token',
  '__Secure-better-auth.session_token',
] as const;

interface ISessionCredentials {
  email: string;
  name: string;
  password: string;
}

function getApiBaseUrl(): string {
  return (
    process.env.E2E_API_ENDPOINT ||
    process.env.NEXT_PUBLIC_API_ENDPOINT ||
    'http://localhost:3010/v1'
  ).replace(/\/+$/, '');
}

function getSessionCredentials(): ISessionCredentials {
  return {
    email: process.env.E2E_BETTER_AUTH_EMAIL || 'e2e-bot@genfeed.test',
    name: 'E2E Bot',
    // Job-local ephemeral database — this is not a real credential.
    password: process.env.E2E_BETTER_AUTH_PASSWORD || 'e2e-bot-password-1',
  };
}

function readSetCookieHeaders(response: Response): string[] {
  const headers = response.headers as Headers & {
    getSetCookie?: () => string[];
  };
  if (typeof headers.getSetCookie === 'function') {
    return headers.getSetCookie();
  }
  const single = headers.get('set-cookie');
  return single ? [single] : [];
}

function extractSessionToken(setCookies: string[]): string | null {
  for (const cookie of setCookies) {
    for (const name of SESSION_COOKIE_NAMES) {
      const prefix = `${name}=`;
      if (cookie.startsWith(prefix)) {
        const value = cookie.slice(prefix.length).split(';')[0].trim();
        if (value) {
          return value;
        }
      }
    }
  }
  return null;
}

async function readErrorBody(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 500);
  } catch {
    return '<unreadable body>';
  }
}

/**
 * Sign the E2E user up against the local API; fall back to sign-in when the
 * user already exists (idempotent re-runs against a warm local database).
 * Returns the raw `better-auth.session_token` cookie value.
 */
async function mintSessionToken(apiBaseUrl: string): Promise<string> {
  const credentials = getSessionCredentials();

  const signUpResponse = await fetch(`${apiBaseUrl}/auth/sign-up/email`, {
    body: JSON.stringify(credentials),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });

  let sessionResponse = signUpResponse;
  if (!signUpResponse.ok) {
    const body = await readErrorBody(signUpResponse);
    if (!/already exists|USER_ALREADY_EXISTS/i.test(body)) {
      throw new Error(
        `Better Auth sign-up failed (${signUpResponse.status}): ${body}`,
      );
    }
    sessionResponse = await fetch(`${apiBaseUrl}/auth/sign-in/email`, {
      body: JSON.stringify({
        email: credentials.email,
        password: credentials.password,
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });
    if (!sessionResponse.ok) {
      throw new Error(
        `Better Auth sign-in failed (${sessionResponse.status}): ${await readErrorBody(sessionResponse)}`,
      );
    }
  }

  const sessionToken = extractSessionToken(
    readSetCookieHeaders(sessionResponse),
  );
  if (!sessionToken) {
    throw new Error(
      'Better Auth sign-up/sign-in succeeded but returned no session cookie.',
    );
  }
  return sessionToken;
}

/**
 * Mark onboarding complete for the freshly minted user so proxy.ts routes the
 * authed smoke to the provisioned workspace instead of `/onboarding`. Uses the
 * same cookie → JWT exchange proxy.ts itself performs.
 */
async function completeOnboarding(
  apiBaseUrl: string,
  sessionToken: string,
): Promise<void> {
  const tokenResponse = await fetch(`${apiBaseUrl}/auth/token`, {
    headers: { cookie: `better-auth.session_token=${sessionToken}` },
  });
  if (!tokenResponse.ok) {
    throw new Error(
      `Better Auth token exchange failed (${tokenResponse.status}): ${await readErrorBody(tokenResponse)}`,
    );
  }
  const { token } = (await tokenResponse.json()) as { token?: string };
  if (!token) {
    throw new Error('Better Auth token exchange returned no JWT.');
  }

  const patchResponse = await fetch(`${apiBaseUrl}/users/me`, {
    body: JSON.stringify({ isOnboardingCompleted: true }),
    headers: {
      Authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    method: 'PATCH',
  });
  if (!patchResponse.ok) {
    throw new Error(
      `Onboarding completion failed (${patchResponse.status}): ${await readErrorBody(patchResponse)}`,
    );
  }
}

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
  const presetToken = process.env.E2E_BETTER_AUTH_SESSION_TOKEN?.trim();
  let sessionToken = presetToken;

  if (!sessionToken) {
    const apiBaseUrl = getApiBaseUrl();
    sessionToken = await mintSessionToken(apiBaseUrl);
    await completeOnboarding(apiBaseUrl, sessionToken);
  }

  mkdirSync(AUTH_DIR, { recursive: true });
  const storageState = JSON.stringify(buildStorageState(sessionToken), null, 2);
  writeFileSync(USER_AUTH_FILE, storageState);
  writeFileSync(ADMIN_AUTH_FILE, storageState);
});
