import { betterAuth } from 'better-auth';
import { type MemoryDB, memoryAdapter } from 'better-auth/adapters/memory';
import { describe, expect, it, vi } from 'vitest';
import { BETTER_AUTH_BASE_PATH } from './better-auth.constants';
import { buildEmailVerificationPolicyHook } from './better-auth.factory';

const AUTH_BASE_URL = 'http://localhost:3010';
const AUTH_SECRET =
  'better-auth-email-verification-contract-secret-with-sufficient-entropy';
const TEST_EMAIL = 'email-verification-contract@example.com';
const TEST_PASSWORD = 'correct-horse-battery-staple';

/**
 * #5407: requiring a verified email is an Admin platform setting read on every
 * auth request, not a boot-time env value. This drives a real Better Auth
 * instance and flips the setting between requests — no rebuild, no restart.
 */
function createHarness() {
  const database: MemoryDB = {
    account: [],
    session: [],
    user: [],
    verification: [],
  };
  const setting = { isRequired: false };
  const sendVerificationEmail = vi.fn(async () => undefined);

  const auth = betterAuth({
    basePath: BETTER_AUTH_BASE_PATH,
    baseURL: AUTH_BASE_URL,
    database: memoryAdapter(database),
    emailAndPassword: { enabled: true, requireEmailVerification: false },
    emailVerification: {
      sendOnSignIn: false,
      sendOnSignUp: false,
      sendVerificationEmail,
    },
    hooks: {
      before: buildEmailVerificationPolicyHook(async () => setting.isRequired),
    },
    rateLimit: { enabled: false },
    secret: AUTH_SECRET,
  });

  function post(path: string, body: Record<string, string>) {
    return auth.handler(
      new Request(`${AUTH_BASE_URL}${BETTER_AUTH_BASE_PATH}${path}`, {
        body: JSON.stringify(body),
        headers: {
          'content-type': 'application/json',
          origin: AUTH_BASE_URL,
        },
        method: 'POST',
      }),
    );
  }

  return {
    sendVerificationEmail,
    setting,
    signIn: () =>
      post('/sign-in/email', { email: TEST_EMAIL, password: TEST_PASSWORD }),
    signUp: () =>
      post('/sign-up/email', {
        email: TEST_EMAIL,
        name: 'Contract User',
        password: TEST_PASSWORD,
      }),
  };
}

describe('Better Auth email-verification policy (#5407)', () => {
  it('applies the operator setting on the next request without a rebuild', async () => {
    const harness = createHarness();

    expect((await harness.signUp()).status).toBe(200);
    expect(harness.sendVerificationEmail).not.toHaveBeenCalled();
    expect((await harness.signIn()).status).toBe(200);

    harness.setting.isRequired = true;
    const blocked = await harness.signIn();
    expect(blocked.status).toBe(403);
    expect(harness.sendVerificationEmail).toHaveBeenCalledTimes(1);

    harness.setting.isRequired = false;
    expect((await harness.signIn()).status).toBe(200);
  });
});
