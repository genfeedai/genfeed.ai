import { betterAuth } from 'better-auth';
import { type MemoryDB, memoryAdapter } from 'better-auth/adapters/memory';
import { magicLink } from 'better-auth/plugins';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildBetterAuthMagicLinkOptions } from './better-auth.factory';
import type {
  IBetterAuthMagicLinkParams,
  ICreateBetterAuthOptions,
} from './better-auth.types';

const AUTH_BASE_URL = 'http://localhost:3000';
const AUTH_BASE_PATH = '/api/auth';
const AUTH_SECRET =
  'better-auth-magic-link-contract-secret-with-sufficient-entropy';
const TEST_EMAIL = 'magic-link-contract@example.com';

interface MagicLinkVerificationBody {
  session: {
    token: string;
    userId: string;
  };
  token: string;
  user: {
    email: string;
    id: string;
  };
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

function createMagicLinkContractHarness() {
  const database: MemoryDB = {
    account: [],
    session: [],
    user: [],
    verification: [],
  };
  let deliveredMagicLink: IBetterAuthMagicLinkParams | undefined;
  const sendMagicLink = vi.fn(
    async (params: IBetterAuthMagicLinkParams): Promise<void> => {
      deliveredMagicLink = params;
    },
  );
  const prisma = {
    user: {
      findFirst: vi.fn(),
    },
  } as unknown as ICreateBetterAuthOptions['prisma'];
  const magicLinkOptions = buildBetterAuthMagicLinkOptions({
    prisma,
    sendMagicLink,
  });
  const auth = betterAuth({
    baseURL: AUTH_BASE_URL,
    database: memoryAdapter(database),
    rateLimit: { enabled: false },
    secret: AUTH_SECRET,
    plugins: [magicLink(magicLinkOptions)],
  });

  return {
    database,
    expiresInSeconds: magicLinkOptions.expiresIn ?? 300,
    getDeliveredMagicLink(): IBetterAuthMagicLinkParams {
      if (!deliveredMagicLink) {
        throw new Error('Expected Better Auth to deliver a magic link');
      }
      return deliveredMagicLink;
    },
    request(path: string, init?: RequestInit): Promise<Response> {
      return auth.handler(
        new Request(`${AUTH_BASE_URL}${AUTH_BASE_PATH}${path}`, init),
      );
    },
    sendMagicLink,
  };
}

async function requestMagicLink(
  harness: ReturnType<typeof createMagicLinkContractHarness>,
): Promise<Response> {
  return harness.request('/sign-in/magic-link', {
    body: JSON.stringify({ email: TEST_EMAIL }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });
}

async function verifyMagicLink(
  harness: ReturnType<typeof createMagicLinkContractHarness>,
  token: string,
): Promise<Response> {
  return harness.request(
    `/magic-link/verify?token=${encodeURIComponent(token)}`,
  );
}

function getSessionCookie(response: Response): string {
  const setCookie = response.headers.get('set-cookie');
  const sessionCookie = setCookie?.match(
    /(?:^|, )([^=;,]*session_token=[^;,]+)/,
  )?.[1];

  if (!sessionCookie) {
    throw new Error('Expected magic-link verification to set a session cookie');
  }
  return sessionCookie;
}

async function expectRecoverableInvalidTokenResponse(
  response: Response,
  rawToken: string,
): Promise<void> {
  const location = response.headers.get('location');
  const body = await response.text();

  expect(response.status).toBe(302);
  expect(location).toBe(`${AUTH_BASE_URL}/?error=INVALID_TOKEN`);
  expect(location).not.toContain(rawToken);
  expect(body).not.toContain(rawToken);
}

afterEach(() => {
  vi.useRealTimers();
});

describe('Better Auth magic-link lifecycle contract', () => {
  it('delivers the one-time link through the canonical callback without exposing token material in the request response', async () => {
    const harness = createMagicLinkContractHarness();

    const response = await requestMagicLink(harness);
    const responseBody = await response.text();
    const delivered = harness.getDeliveredMagicLink();

    expect(response.status).toBe(200);
    expect(JSON.parse(responseBody)).toEqual({ status: true });
    expect(harness.sendMagicLink).toHaveBeenCalledOnce();
    expect(delivered.email).toBe(TEST_EMAIL);
    expect(delivered.url).toContain('/api/auth/magic-link/verify');
    expect(delivered.url).toContain(encodeURIComponent(delivered.token));
    expect(responseBody).not.toContain(delivered.token);
    expect(response.headers.get('location')).toBeNull();
    expect(JSON.stringify(harness.database)).not.toContain(delivered.token);
  });

  it('establishes a session from a valid token and authenticates the session cookie', async () => {
    const harness = createMagicLinkContractHarness();
    await requestMagicLink(harness);
    const delivered = harness.getDeliveredMagicLink();

    const verificationResponse = await verifyMagicLink(
      harness,
      delivered.token,
    );
    const verification =
      (await verificationResponse.json()) as MagicLinkVerificationBody;
    const sessionCookie = getSessionCookie(verificationResponse);
    const sessionResponse = await harness.request('/get-session', {
      headers: { cookie: sessionCookie },
    });
    const session = (await sessionResponse.json()) as SessionBody;

    expect(verificationResponse.status).toBe(200);
    expect(verification.user.email).toBe(TEST_EMAIL);
    expect(verification.session.userId).toBe(verification.user.id);
    expect(verification.token).toBe(verification.session.token);
    expect(sessionResponse.status).toBe(200);
    expect(session.user).toEqual(verification.user);
    expect(session.session.userId).toBe(verification.user.id);
    expect(session.session.token).toBe(verification.session.token);
  });

  it('rejects an expired token without creating a session', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-20T12:00:00.000Z'));
    const harness = createMagicLinkContractHarness();
    await requestMagicLink(harness);
    const delivered = harness.getDeliveredMagicLink();
    vi.advanceTimersByTime((harness.expiresInSeconds + 1) * 1_000);

    const response = await verifyMagicLink(harness, delivered.token);

    await expectRecoverableInvalidTokenResponse(response, delivered.token);
    expect(harness.database.session ?? []).toHaveLength(0);
  });

  it('rejects a replay after one successful verification without minting another session', async () => {
    const harness = createMagicLinkContractHarness();
    await requestMagicLink(harness);
    const delivered = harness.getDeliveredMagicLink();

    const firstResponse = await verifyMagicLink(harness, delivered.token);
    const replayResponse = await verifyMagicLink(harness, delivered.token);

    expect(firstResponse.status).toBe(200);
    await expectRecoverableInvalidTokenResponse(
      replayResponse,
      delivered.token,
    );
    expect(harness.database.session ?? []).toHaveLength(1);
  });
});
