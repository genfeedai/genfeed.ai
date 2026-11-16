import { betterAuth } from 'better-auth';
import { type MemoryDB, memoryAdapter } from 'better-auth/adapters/memory';
import { jwt } from 'better-auth/plugins';
import { createLocalJWKSet, jwtVerify } from 'jose';
import { describe, expect, it } from 'vitest';
import { BETTER_AUTH_BASE_PATH } from './better-auth.constants';
import type { BetterAuthInstance } from './better-auth.factory';
import { BetterAuthService } from './better-auth.service';

const AUTH_BASE_URL = 'http://localhost:3010';
const AUTH_SECRET = 'better-auth-service-token-secret-with-sufficient-entropy';

function createHarness() {
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
    plugins: [jwt({ jwt: { audience: AUTH_BASE_URL, issuer: AUTH_BASE_URL } })],
    rateLimit: { enabled: false },
    secret: AUTH_SECRET,
  });
  const service = new BetterAuthService(auth as unknown as BetterAuthInstance);
  const keys = async () =>
    createLocalJWKSet(
      (await auth.api.getJwks()) as Parameters<typeof createLocalJWKSet>[0],
    );
  return { keys, service };
}

describe('Better Auth service token (the marketplace service call)', () => {
  const claims = {
    audience: 'marketplace-service',
    lifetimeSeconds: 60,
    scope: 'purchases:record',
    subject: 'genfeed-api',
  };

  it('is signed with the key the JWKS publishes and carries the service claims', async () => {
    const { keys, service } = createHarness();

    const token = await service.signServiceToken(claims);
    const { payload } = await jwtVerify(token, await keys(), {
      audience: 'marketplace-service',
      issuer: AUTH_BASE_URL,
      subject: 'genfeed-api',
    });

    expect(payload.scope).toBe('purchases:record');
    expect((payload.exp ?? 0) - (payload.iat ?? 0)).toBe(60);
    expect(typeof payload.jti).toBe('string');
  });

  it('does not verify as a user identity token', async () => {
    const { keys, service } = createHarness();

    const token = await service.signServiceToken(claims);

    await expect(
      jwtVerify(token, await keys(), {
        audience: AUTH_BASE_URL,
        issuer: AUTH_BASE_URL,
      }),
    ).rejects.toThrow();
  });

  it('gives every token its own id', async () => {
    const { keys, service } = createHarness();

    const [first, second] = await Promise.all([
      service.signServiceToken(claims),
      service.signServiceToken(claims),
    ]);
    const ids = await Promise.all(
      [first, second].map(
        async (token) => (await jwtVerify(token, await keys())).payload.jti,
      ),
    );

    expect(ids[0]).not.toBe(ids[1]);
  });
});
