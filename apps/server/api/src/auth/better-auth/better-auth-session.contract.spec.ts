import { betterAuth } from 'better-auth';
import { type MemoryDB, memoryAdapter } from 'better-auth/adapters/memory';
import { describe, expect, it } from 'vitest';
import { BETTER_AUTH_BASE_PATH } from './better-auth.constants';
import { buildBetterAuthAdvancedOptions } from './better-auth.factory';

const AUTH_SECRET =
  'better-auth-session-contract-secret-with-sufficient-entropy';
const TEST_PASSWORD = 'session-contract-password';

interface SessionBody {
  session: {
    token: string;
    userId: string;
  };
  user: {
    email: string;
    id: string;
  };
}

interface SessionContractMode {
  baseURL: string;
  cookieDomain?: string;
  expectedCookieDomain?: string;
  name: string;
}

const SESSION_CONTRACT_MODES: SessionContractMode[] = [
  {
    baseURL: 'http://genfeed.localhost:3010',
    name: 'self-hosted',
  },
  {
    baseURL: 'https://api.genfeed.ai',
    cookieDomain: '.genfeed.ai',
    expectedCookieDomain: 'genfeed.ai',
    name: 'cloud',
  },
];

function createSessionContractHarness(mode: SessionContractMode) {
  const database: MemoryDB = {
    account: [],
    session: [],
    user: [],
    verification: [],
  };
  const auth = betterAuth({
    advanced: buildBetterAuthAdvancedOptions({
      cookieDomain: mode.cookieDomain,
    }),
    basePath: BETTER_AUTH_BASE_PATH,
    baseURL: mode.baseURL,
    database: memoryAdapter(database),
    emailAndPassword: { enabled: true },
    rateLimit: { enabled: false },
    secret: AUTH_SECRET,
  });

  return {
    database,
    request(path: string, init?: RequestInit): Promise<Response> {
      return auth.handler(
        new Request(`${mode.baseURL}${BETTER_AUTH_BASE_PATH}${path}`, init),
      );
    },
  };
}

function getSessionCookie(response: Response): {
  cookie: string;
  setCookie: string;
} {
  const setCookie = response.headers.get('set-cookie');
  const cookie = setCookie?.match(
    /(?:^|, )([^=;,]*session_token=[^;,]+)/,
  )?.[1];

  if (!setCookie || !cookie) {
    throw new Error('Expected password sign-up to set a session cookie');
  }

  return { cookie, setCookie };
}

describe('Better Auth session reload deployment contract', () => {
  it.each(SESSION_CONTRACT_MODES)(
    'restores the $name session from a fresh request with the intended cookie scope',
    async (mode) => {
      const harness = createSessionContractHarness(mode);
      const email = `session-contract-${mode.name}@example.com`;
      const signUpResponse = await harness.request('/sign-up/email', {
        body: JSON.stringify({
          email,
          name: 'Session Contract',
          password: TEST_PASSWORD,
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });
      const { cookie, setCookie } = getSessionCookie(signUpResponse);

      expect(signUpResponse.status).toBe(200);
      expect(setCookie).toMatch(/;\s*HttpOnly/i);
      if (mode.expectedCookieDomain) {
        expect(setCookie).toMatch(
          new RegExp(
            `;\\s*Domain=\\.?${mode.expectedCookieDomain.replaceAll('.', '\\.')}\\b`,
            'i',
          ),
        );
      } else {
        expect(setCookie).not.toMatch(/;\s*Domain=/i);
      }

      const sessionResponse = await harness.request('/get-session', {
        headers: { cookie },
      });
      const session = (await sessionResponse.json()) as SessionBody;

      expect(sessionResponse.status).toBe(200);
      expect(session.user.email).toBe(email);
      expect(session.session.userId).toBe(session.user.id);
      expect(session.session.token).toBeTruthy();
      expect(harness.database.session ?? []).toHaveLength(1);

      const anonymousResponse = await harness.request('/get-session');

      expect(anonymousResponse.status).toBe(200);
      await expect(anonymousResponse.json()).resolves.toBeNull();
    },
  );
});
