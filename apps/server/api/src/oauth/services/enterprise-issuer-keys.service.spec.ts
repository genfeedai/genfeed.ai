import type { LoggerService } from '@libs/logger/logger.service';
import { safeFetch } from '@libs/security/destination-guard';
import { exportJWK, generateKeyPair, jwtVerify, SignJWT } from 'jose';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EnterpriseIssuerKeysService,
  IssuerKeysError,
} from './enterprise-issuer-keys.service';

vi.mock('@libs/security/destination-guard', () => ({ safeFetch: vi.fn() }));

const ISSUER = 'https://idp.acme.example';
const DISCOVERY_URL = `${ISSUER}/.well-known/openid-configuration`;
const JWKS_URL = `${ISSUER}/keys`;

function json(value: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(value), {
    headers: { 'content-type': 'application/json', ...headers },
  });
}

async function keyPair(kid: string) {
  const { privateKey, publicKey } = await generateKeyPair('ES256');
  return {
    jwk: { ...(await exportJWK(publicKey)), alg: 'ES256', kid, use: 'sig' },
    privateKey,
  };
}

function buildService() {
  return new EnterpriseIssuerKeysService({
    warn: () => undefined,
  } as unknown as LoggerService);
}

/** Serves the discovery document and a mutable key set, counting key fetches. */
function serveIssuer(
  initialKeys: unknown[],
  discovery: Record<string, unknown> = { issuer: ISSUER, jwks_uri: JWKS_URL },
) {
  const state = { keys: initialKeys, keyFetches: 0 };
  vi.mocked(safeFetch).mockImplementation(async (input) => {
    const url = String(input);
    if (url === DISCOVERY_URL) return json(discovery);
    if (url === JWKS_URL) {
      state.keyFetches += 1;
      return json({ keys: state.keys });
    }
    return new Response('not found', { status: 404 });
  });
  return state;
}

async function verifiesWith(
  service: EnterpriseIssuerKeysService,
  privateKey: CryptoKey,
  kid: string,
) {
  const token = await new SignJWT({ ok: true })
    .setProtectedHeader({ alg: 'ES256', kid })
    .sign(privateKey);
  const getKey = await service.resolver(ISSUER, kid);
  return jwtVerify(token, getKey);
}

describe('EnterpriseIssuerKeysService', () => {
  beforeEach(() => {
    vi.mocked(safeFetch).mockReset();
  });

  it('verifies with the keys the issuer publishes', async () => {
    const { jwk, privateKey } = await keyPair('key-1');
    serveIssuer([jwk]);

    await expect(
      verifiesWith(buildService(), privateKey, 'key-1'),
    ).resolves.toMatchObject({ payload: { ok: true } });
  });

  it('reuses fetched keys instead of fetching on every request', async () => {
    const { jwk, privateKey } = await keyPair('key-1');
    const state = serveIssuer([jwk]);
    const service = buildService();

    await verifiesWith(service, privateKey, 'key-1');
    await verifiesWith(service, privateKey, 'key-1');

    expect(state.keyFetches).toBe(1);
  });

  it('refetches once when a rotated key shows up with an unknown kid', async () => {
    const first = await keyPair('key-1');
    const rotated = await keyPair('key-2');
    const state = serveIssuer([first.jwk]);
    const service = buildService();
    await verifiesWith(service, first.privateKey, 'key-1');

    state.keys = [first.jwk, rotated.jwk];
    vi.useFakeTimers({ now: Date.now() + 60_000, toFake: ['Date'] });
    try {
      await expect(
        verifiesWith(service, rotated.privateKey, 'key-2'),
      ).resolves.toMatchObject({ payload: { ok: true } });
    } finally {
      vi.useRealTimers();
    }
    expect(state.keyFetches).toBe(2);
  });

  it('does not refetch on every unknown kid', async () => {
    const { jwk, privateKey } = await keyPair('key-1');
    const state = serveIssuer([jwk]);
    const service = buildService();
    await verifiesWith(service, privateKey, 'key-1');

    await expect(service.resolver(ISSUER, 'attacker-kid')).resolves.toBeTypeOf(
      'function',
    );
    await expect(
      service.resolver(ISSUER, 'attacker-kid-2'),
    ).resolves.toBeTypeOf('function');

    expect(state.keyFetches).toBe(1);
  });

  it.each([
    [
      'metadata for a different issuer',
      { issuer: 'https://evil.example', jwks_uri: JWKS_URL },
    ],
    [
      'a plaintext jwks_uri',
      { issuer: ISSUER, jwks_uri: 'http://idp.acme.example/keys' },
    ],
    ['no jwks_uri', { issuer: ISSUER }],
  ])('refuses %s', async (_label, discovery) => {
    serveIssuer([], discovery);

    await expect(
      buildService().resolver(ISSUER, 'key-1'),
    ).rejects.toBeInstanceOf(IssuerKeysError);
  });

  it('refuses an issuer that is not https', async () => {
    await expect(
      buildService().resolver('http://idp.acme.example', 'key-1'),
    ).rejects.toBeInstanceOf(IssuerKeysError);
  });

  it('refuses when the issuer cannot be reached', async () => {
    vi.mocked(safeFetch).mockRejectedValue(new Error('blocked destination'));

    await expect(
      buildService().resolver(ISSUER, 'key-1'),
    ).rejects.toBeInstanceOf(IssuerKeysError);
  });
});
