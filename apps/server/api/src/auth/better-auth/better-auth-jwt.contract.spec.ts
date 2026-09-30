import { UnauthorizedException } from '@nestjs/common';
import { betterAuth } from 'better-auth';
import { type MemoryDB, memoryAdapter } from 'better-auth/adapters/memory';
import { jwt } from 'better-auth/plugins';
import { describe, expect, it } from 'vitest';
import { BETTER_AUTH_BASE_PATH } from './better-auth.constants';
import type { BetterAuthInstance } from './better-auth.factory';
import { BetterAuthService } from './better-auth.service';

const AUTH_BASE_URL = 'http://localhost:3010';
const AUTH_SECRET = 'better-auth-jwt-contract-secret-with-sufficient-entropy';
const TEST_PASSWORD = 'jwt-contract-password-1';
const SESSION_COOKIE_NAMES = [
  'better-auth.session_token',
  '__Secure-better-auth.session_token',
] as const;

/**
 * Mirror `playwright/e2e/auth.setup.ts` cookie extraction so this contract
 * fails the same way the authed E2E helper does when Set-Cookie shape drifts.
 */
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

function createJwtContractHarness() {
  const database: MemoryDB = {
    account: [],
    jwks: [],
    session: [],
    user: [],
    verification: [],
  };
  const auth = betterAuth({
    basePath: BETTER_AUTH_BASE_PATH,
    baseURL: AUTH_BASE_URL,
    database: memoryAdapter(database),
    emailAndPassword: { enabled: true },
    plugins: [
      jwt({
        jwt: {
          audience: AUTH_BASE_URL,
          issuer: AUTH_BASE_URL,
        },
      }),
    ],
    rateLimit: { enabled: false },
    secret: AUTH_SECRET,
  });

  return {
    auth,
    request(path: string, init?: RequestInit): Promise<Response> {
      return auth.handler(
        new Request(`${AUTH_BASE_URL}${BETTER_AUTH_BASE_PATH}${path}`, init),
      );
    },
  };
}

describe('Better Auth JWT mint/verify contract (authed E2E helper)', () => {
  it('mints a session cookie, exchanges it for a JWT, and verifies that JWT', async () => {
    const harness = createJwtContractHarness();
    const email = 'jwt-contract@example.com';
    const signUpResponse = await harness.request('/sign-up/email', {
      body: JSON.stringify({
        email,
        name: 'JWT Contract',
        password: TEST_PASSWORD,
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });

    expect(signUpResponse.status).toBe(200);

    const sessionToken = extractSessionToken(
      readSetCookieHeaders(signUpResponse),
    );
    expect(sessionToken).toBeTruthy();

    const tokenResponse = await harness.request('/token', {
      headers: { cookie: `better-auth.session_token=${sessionToken}` },
    });
    expect(tokenResponse.status).toBe(200);

    const tokenBody = (await tokenResponse.json()) as { token?: string };
    expect(typeof tokenBody.token).toBe('string');
    expect(tokenBody.token?.split('.')).toHaveLength(3);

    const verifyResult = await harness.auth.api.verifyJWT({
      body: { token: tokenBody.token as string },
    });

    expect(verifyResult?.payload?.sub).toEqual(expect.any(String));
    expect(verifyResult?.payload?.aud).toBe(AUTH_BASE_URL);

    const service = new BetterAuthService(
      harness.auth as unknown as BetterAuthInstance,
    );
    const claims = await service.verifyToken(tokenBody.token as string);

    expect(claims.sub).toBe(verifyResult.payload?.sub);
    expect(claims.aud).toBe(AUTH_BASE_URL);
  });

  it('verifies a minted JWT against JWKS when api.verifyJWT returns no payload', async () => {
    const harness = createJwtContractHarness();
    const signUpResponse = await harness.request('/sign-up/email', {
      body: JSON.stringify({
        email: 'jwt-contract-fallback@example.com',
        name: 'JWT Fallback',
        password: TEST_PASSWORD,
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });
    const sessionToken = extractSessionToken(
      readSetCookieHeaders(signUpResponse),
    );
    const tokenResponse = await harness.request('/token', {
      headers: { cookie: `better-auth.session_token=${sessionToken}` },
    });
    const { token } = (await tokenResponse.json()) as { token?: string };
    expect(token).toBeTruthy();

    harness.auth.api.verifyJWT = (async () => ({
      payload: null,
    })) as typeof harness.auth.api.verifyJWT;

    const service = new BetterAuthService(
      harness.auth as unknown as BetterAuthInstance,
    );
    const claims = await service.verifyToken(token as string);

    expect(claims.sub).toEqual(expect.any(String));
  });

  it('rejects a non-JWT bearer the same way PATCH /users/me does', async () => {
    const harness = createJwtContractHarness();
    const service = new BetterAuthService(
      harness.auth as unknown as BetterAuthInstance,
    );

    await expect(service.verifyToken('not-a-jwt')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
