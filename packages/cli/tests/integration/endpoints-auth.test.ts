/**
 * Endpoint auth audit.
 *
 * Documents which endpoints accept gf_* API key auth vs which reject with
 * 401/403 due to the server-side ClerkGuard bug.
 *
 * Server-side fix needed: Remove redundant @UseGuards(ClerkGuard, RolesGuard)
 * from controller classes already protected by global CombinedAuthGuard.
 * Affected: images, videos, workflows, images-operations, images-relationships
 */
import { describe, expect, it } from 'vitest';
import { createTestClient, hasCredentials, testConfig } from './setup.js';

type AuthResult = 'ok' | 'blocked' | 'error';

async function checkEndpoint(
  client: ReturnType<typeof createTestClient>,
  path: string
): Promise<{ status: number; result: AuthResult }> {
  try {
    await client(path, { method: 'GET' });
    return { result: 'ok', status: 200 };
  } catch (error: unknown) {
    const status = (error as { status?: number }).status ?? 0;
    if (status === 401 || status === 403) {
      return { result: 'blocked', status };
    }
    return { result: 'error', status };
  }
}

describe.skipIf(!hasCredentials)('integration/endpoints-auth', () => {
  const client = hasCredentials ? createTestClient() : undefined!;
  const orgId = testConfig?.organizationId ?? '';

  it('GET /auth/whoami accepts API key', async () => {
    const { result } = await checkEndpoint(client, '/auth/whoami');
    expect(result).toBe('ok');
  }, 15_000);

  it('GET /organizations/:orgId/brands accepts API key', async () => {
    const { result } = await checkEndpoint(client, `/organizations/${orgId}/brands`);
    expect(result).toBe('ok');
  }, 15_000);

  it('GET /organizations/:orgId/ingredients accepts API key', async () => {
    const { result } = await checkEndpoint(client, `/organizations/${orgId}/ingredients?limit=1`);
    expect(result).toBe('ok');
  }, 15_000);

  it('GET /personas accepts API key', async () => {
    const { result } = await checkEndpoint(client, '/personas');
    expect(result).toBe('ok');
  }, 15_000);

  // Document the server-side auth bug — these should return 'ok' after the
  // cloud-repo fix removes redundant @UseGuards(ClerkGuard, RolesGuard)

  it('GET /images is blocked by ClerkGuard (known bug)', async () => {
    const { result, status } = await checkEndpoint(client, '/images?limit=1');
    // Currently blocked — flip to 'ok' once server is fixed
    expect(result).toBe('blocked');
    expect(status).toBeOneOf([401, 403]);
  }, 15_000);

  it('GET /videos is blocked by ClerkGuard (known bug)', async () => {
    const { result, status } = await checkEndpoint(client, '/videos?limit=1');
    expect(result).toBe('blocked');
    expect(status).toBeOneOf([401, 403]);
  }, 15_000);

  it('GET /workflows is blocked by ClerkGuard (known bug)', async () => {
    const { result, status } = await checkEndpoint(client, '/workflows');
    expect(result).toBe('blocked');
    expect(status).toBeOneOf([401, 403]);
  }, 15_000);
});
