import { betterAuth } from 'better-auth';
import { type MemoryDB, memoryAdapter } from 'better-auth/adapters/memory';
import { parseSetCookieHeader } from 'better-auth/cookies';
import { admin } from 'better-auth/plugins';
import { describe, expect, it } from 'vitest';
import { BETTER_AUTH_BASE_PATH } from './better-auth.constants';
import { buildBetterAuthAdminOptions } from './better-auth.factory';

const AUTH_BASE_URL = 'https://api.genfeed.ai';
const AUTH_SECRET =
  'better-auth-admin-impersonation-contract-secret-with-sufficient-entropy';
const TEST_PASSWORD = 'admin-impersonation-contract-password';
const HOUR_IN_MS = 3_600_000;

interface SessionBody {
  session: {
    expiresAt: Date | string;
    impersonatedBy?: string | null;
    token: string;
    userId: string;
  };
  user: {
    email: string;
    id: string;
  };
}

/**
 * Cookie jar for multi-cookie flows: impersonation swaps the session cookie
 * AND parks the operator session in a signed `admin_session` cookie, so a
 * single extracted session token is not enough to exercise the round trip.
 */
function updateCookieJar(jar: Map<string, string>, response: Response): void {
  const setCookie = response.headers.get('set-cookie');
  if (!setCookie) {
    return;
  }
  for (const [name, attributes] of parseSetCookieHeader(setCookie)) {
    if (!attributes.value || attributes['max-age'] === 0) {
      jar.delete(name);
      continue;
    }
    jar.set(name, attributes.value);
  }
}

function toCookieHeader(jar: Map<string, string>): string {
  return [...jar.entries()]
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
}

function createAdminContractHarness() {
  const database: MemoryDB = {
    account: [],
    session: [],
    user: [],
    verification: [],
  };
  const auth = betterAuth({
    basePath: BETTER_AUTH_BASE_PATH,
    baseURL: AUTH_BASE_URL,
    database: memoryAdapter(database),
    emailAndPassword: { enabled: true },
    plugins: [admin(buildBetterAuthAdminOptions())],
    rateLimit: { enabled: false },
    secret: AUTH_SECRET,
  });

  const request = (path: string, init?: RequestInit): Promise<Response> =>
    auth.handler(
      new Request(`${AUTH_BASE_URL}${BETTER_AUTH_BASE_PATH}${path}`, init),
    );

  return {
    database,
    request,
    async signUp(
      email: string,
      name: string,
    ): Promise<{ jar: Map<string, string>; userId: string }> {
      const response = await request('/sign-up/email', {
        body: JSON.stringify({ email, name, password: TEST_PASSWORD }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });
      if (response.status !== 200) {
        throw new Error(`Sign-up for ${email} failed: ${response.status}`);
      }
      const jar = new Map<string, string>();
      updateCookieJar(jar, response);
      const body = (await response.json()) as { user: { id: string } };
      return { jar, userId: body.user.id };
    },
    promoteToSuperAdmin(userId: string): void {
      const user = (database.user ?? []).find((row) => row.id === userId);
      if (!user) {
        throw new Error(`No user row to promote for ${userId}`);
      }
      user.platformRole = 'SUPERADMIN';
    },
  };
}

describe('Better Auth admin impersonation contract', () => {
  it('writes sign-ups through the role field mapping into platformRole', async () => {
    const harness = createAdminContractHarness();

    const { userId } = await harness.signUp(
      'mapping@example.com',
      'Mapping Contract',
    );
    const row = (harness.database.user ?? []).find(
      (user) => user.id === userId,
    );

    // defaultRole flows through the schema mapping: the row carries the
    // Genfeed column (a valid PlatformRole enum value), not a plugin `role`.
    expect(row?.platformRole).toBe('USER');
    expect(row?.role).toBeUndefined();
  });

  it('lets a superadmin impersonate a user, records the audit trail, and restores the operator session on stop', async () => {
    const harness = createAdminContractHarness();
    const operator = await harness.signUp(
      'operator@example.com',
      'Operator Contract',
    );
    const target = await harness.signUp(
      'target@example.com',
      'Target Contract',
    );
    harness.promoteToSuperAdmin(operator.userId);

    const impersonateResponse = await harness.request(
      '/admin/impersonate-user',
      {
        body: JSON.stringify({ userId: target.userId }),
        headers: {
          'content-type': 'application/json',
          cookie: toCookieHeader(operator.jar),
        },
        method: 'POST',
      },
    );
    expect(impersonateResponse.status).toBe(200);
    updateCookieJar(operator.jar, impersonateResponse);

    const impersonated = (await impersonateResponse.json()) as SessionBody;
    expect(impersonated.user.id).toBe(target.userId);
    expect(impersonated.session.userId).toBe(target.userId);
    expect(impersonated.session.impersonatedBy).toBe(operator.userId);
    // Plugin default expiry: 1h, not the regular session lifetime.
    const expiresInMs =
      new Date(impersonated.session.expiresAt).getTime() - Date.now();
    expect(expiresInMs).toBeGreaterThan(HOUR_IN_MS - 120_000);
    expect(expiresInMs).toBeLessThanOrEqual(HOUR_IN_MS + 120_000);

    // The audit trail is persisted on the session row, not response-only.
    const persisted = (harness.database.session ?? []).find(
      (session) => session.token === impersonated.session.token,
    );
    expect(persisted?.impersonatedBy).toBe(operator.userId);

    // The browser now resolves the target user's session.
    const impersonatedSessionResponse = await harness.request('/get-session', {
      headers: { cookie: toCookieHeader(operator.jar) },
    });
    const impersonatedSession =
      (await impersonatedSessionResponse.json()) as SessionBody;
    expect(impersonatedSession.user.id).toBe(target.userId);
    expect(impersonatedSession.session.impersonatedBy).toBe(operator.userId);

    const stopResponse = await harness.request('/admin/stop-impersonating', {
      headers: { cookie: toCookieHeader(operator.jar) },
      method: 'POST',
    });
    expect(stopResponse.status).toBe(200);
    updateCookieJar(operator.jar, stopResponse);

    const restoredResponse = await harness.request('/get-session', {
      headers: { cookie: toCookieHeader(operator.jar) },
    });
    const restored = (await restoredResponse.json()) as SessionBody;
    expect(restored.user.id).toBe(operator.userId);
    expect(restored.session.impersonatedBy).toBeFalsy();
    // The impersonated session is revoked, not left dangling.
    expect(
      (harness.database.session ?? []).some(
        (session) => session.token === impersonated.session.token,
      ),
    ).toBe(false);
  });

  it('rejects impersonation for non-superadmins and anonymous callers', async () => {
    const harness = createAdminContractHarness();
    const regular = await harness.signUp(
      'regular@example.com',
      'Regular Contract',
    );
    const target = await harness.signUp(
      'victim@example.com',
      'Victim Contract',
    );

    const forbiddenResponse = await harness.request('/admin/impersonate-user', {
      body: JSON.stringify({ userId: target.userId }),
      headers: {
        'content-type': 'application/json',
        cookie: toCookieHeader(regular.jar),
      },
      method: 'POST',
    });
    expect(forbiddenResponse.status).toBe(403);

    const anonymousResponse = await harness.request('/admin/impersonate-user', {
      body: JSON.stringify({ userId: target.userId }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });
    expect(anonymousResponse.status).toBe(401);

    // No impersonation session was ever created.
    expect(
      (harness.database.session ?? []).some(
        (session) => session.impersonatedBy,
      ),
    ).toBe(false);
  });

  it('rejects impersonating another superadmin (impersonate-admins withheld)', async () => {
    const harness = createAdminContractHarness();
    const operator = await harness.signUp(
      'operator-two@example.com',
      'Operator Two',
    );
    const peer = await harness.signUp('peer@example.com', 'Peer Superadmin');
    harness.promoteToSuperAdmin(operator.userId);
    harness.promoteToSuperAdmin(peer.userId);

    const response = await harness.request('/admin/impersonate-user', {
      body: JSON.stringify({ userId: peer.userId }),
      headers: {
        'content-type': 'application/json',
        cookie: toCookieHeader(operator.jar),
      },
      method: 'POST',
    });

    expect(response.status).toBe(403);
    expect(
      (harness.database.session ?? []).some(
        (session) => session.impersonatedBy,
      ),
    ).toBe(false);
  });
});
