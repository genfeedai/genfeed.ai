import { betterAuth } from 'better-auth';
import { type MemoryDB, memoryAdapter } from 'better-auth/adapters/memory';
import {
  type CookieAttributes,
  parseSetCookieHeader,
} from 'better-auth/cookies';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BETTER_AUTH_BASE_PATH } from './better-auth.constants';
import { parseDesktopSessionCookie } from './better-auth.service';
import { desktopSession } from './plugins/desktop-session.plugin';

const AUTH_BASE_URL = 'https://api.genfeed.ai';
const AUTH_SECRET =
  'better-auth-desktop-session-contract-secret-with-sufficient-entropy';
const TEST_USER_EMAIL = 'desktop-session-contract@example.com';
const TEST_USER_ID = 'desktop-session-contract-user';
const TEST_USER_NAME = 'Desktop Session Contract';

interface DesktopSessionBody {
  expiresAt: Date | string;
  token: string;
}

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

function createDesktopSessionContractHarness() {
  const now = new Date();
  const database: MemoryDB = {
    account: [],
    session: [],
    user: [
      {
        createdAt: now,
        email: TEST_USER_EMAIL,
        emailVerified: true,
        id: TEST_USER_ID,
        name: TEST_USER_NAME,
        updatedAt: now,
      },
    ],
    verification: [],
  };
  const auth = betterAuth({
    basePath: BETTER_AUTH_BASE_PATH,
    baseURL: AUTH_BASE_URL,
    database: memoryAdapter(database),
    plugins: [desktopSession()],
    rateLimit: { enabled: false },
    secret: AUTH_SECRET,
  });

  return {
    createSession(userId = TEST_USER_ID) {
      return auth.api.createDesktopSession({
        body: { userId },
        returnHeaders: true,
      });
    },
    database,
    request(path: string, init?: RequestInit): Promise<Response> {
      return auth.handler(
        new Request(`${AUTH_BASE_URL}${BETTER_AUTH_BASE_PATH}${path}`, init),
      );
    },
    revokeSession(token: string) {
      return auth.api.revokeDesktopSession({ body: { token } });
    },
  };
}

function resolveExpectedExpiresAt(
  attributes: CookieAttributes,
  fallback: Date | string,
): string {
  if (attributes.expires) {
    return attributes.expires.toISOString();
  }
  if (typeof attributes['max-age'] === 'number') {
    return new Date(Date.now() + attributes['max-age'] * 1_000).toISOString();
  }
  const fallbackDate = fallback instanceof Date ? fallback : new Date(fallback);
  return fallbackDate.toISOString();
}

afterEach(() => {
  vi.useRealTimers();
});

describe('Better Auth desktop session lifecycle contract', () => {
  it('emits an exact signed cookie that authenticates and can be revoked', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-05T12:00:00.000Z'));
    const harness = createDesktopSessionContractHarness();

    const createResult = await harness.createSession();
    const created = createResult.response as DesktopSessionBody;
    const descriptor = parseDesktopSessionCookie(createResult.headers, created);
    const persistedSession = (harness.database.session ?? []).find(
      (session) => session.token === created.token,
    );
    const emittedCookie = parseSetCookieHeader(
      createResult.headers.get('set-cookie') ?? '',
    ).get(descriptor.cookieName);

    expect(persistedSession).toBeDefined();
    expect(descriptor.cookieName).toBe('__Secure-better-auth.session_token');
    expect(descriptor.cookieValue).not.toBe(created.token);
    expect(descriptor.cookieValue.startsWith(`${created.token}.`)).toBe(true);
    expect(emittedCookie).toBeDefined();
    expect(descriptor.expiresAt).toBe(
      resolveExpectedExpiresAt(
        emittedCookie as CookieAttributes,
        created.expiresAt,
      ),
    );
    expect(descriptor.httpOnly).toBe(emittedCookie?.httponly ?? false);
    expect(descriptor.path).toBe(emittedCookie?.path ?? '/');
    expect(descriptor.sameSite).toBe(emittedCookie?.samesite ?? 'lax');
    expect(descriptor.secure).toBe(emittedCookie?.secure ?? false);
    expect(descriptor.secure).toBe(true);

    const cookie = `${descriptor.cookieName}=${descriptor.cookieValue}`;
    const sessionResponse = await harness.request('/get-session', {
      headers: { cookie },
    });
    const session = (await sessionResponse.json()) as SessionBody;

    expect(sessionResponse.status).toBe(200);
    expect(session.user.id).toBe(TEST_USER_ID);
    expect(session.user.email).toBe(TEST_USER_EMAIL);
    expect(session.session.token).toBe(created.token);
    expect(session.session.userId).toBe(TEST_USER_ID);

    const revokeResult = await harness.revokeSession(created.token);
    const revokedSessionResponse = await harness.request('/get-session', {
      headers: { cookie },
    });

    expect(revokeResult).toEqual({ status: true });
    expect(harness.database.session ?? []).toHaveLength(0);
    expect(revokedSessionResponse.status).toBe(200);
    await expect(revokedSessionResponse.json()).resolves.toBeNull();
  });

  it('returns 404 without creating a session for a missing user', async () => {
    const harness = createDesktopSessionContractHarness();

    await expect(
      harness.createSession('missing-desktop-user'),
    ).rejects.toMatchObject({
      status: 'NOT_FOUND',
      statusCode: 404,
    });
    expect(harness.database.session ?? []).toHaveLength(0);
  });

  it('does not expose the server-only issuance and revoke endpoints over HTTP', async () => {
    const harness = createDesktopSessionContractHarness();
    const createResponse = await harness.request('/desktop/session', {
      body: JSON.stringify({ userId: TEST_USER_ID }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });
    const revokeResponse = await harness.request('/desktop/session/revoke', {
      body: JSON.stringify({ token: 'not-a-session' }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });

    expect(createResponse.status).toBe(404);
    expect(revokeResponse.status).toBe(404);
    expect(harness.database.session ?? []).toHaveLength(0);
  });
});
