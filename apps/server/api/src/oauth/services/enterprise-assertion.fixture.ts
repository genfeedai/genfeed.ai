import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  type JWK,
  type JWTPayload,
  SignJWT,
} from 'jose';
import type { EnterpriseIssuerKeysService } from './enterprise-issuer-keys.service';

export const FIXTURE_ISSUER = 'https://idp.acme.example';
export const FIXTURE_AUDIENCE = 'https://api.genfeed.ai';
export const FIXTURE_CLIENT_ID =
  'https://claude.ai/oauth/mcp-oauth-client-metadata';

type SignOptions = {
  alg?: 'ES256' | 'RS256';
  claims?: Record<string, unknown>;
  header?: Record<string, unknown>;
  omit?: string[];
};

/** A real signing key pair plus the key resolver an issuer would publish. */
export async function buildIssuerFixture(alg: 'ES256' | 'RS256' = 'ES256') {
  const { privateKey, publicKey } = await generateKeyPair(alg);
  const jwk: JWK = {
    ...(await exportJWK(publicKey)),
    alg,
    kid: 'key-1',
    use: 'sig',
  };
  const issuerKeys = {
    resolver: async () => createLocalJWKSet({ keys: [jwk] }),
  } as unknown as EnterpriseIssuerKeysService;

  async function sign({
    claims = {},
    header = {},
    omit = [],
    alg: signAlg = alg,
  }: SignOptions = {}) {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const payload: JWTPayload = {
      aud: [FIXTURE_AUDIENCE],
      client_id: FIXTURE_CLIENT_ID,
      email: 'Alex@Acme.example',
      exp: nowSeconds + 60,
      iat: nowSeconds,
      iss: FIXTURE_ISSUER,
      jti: `jti-${Math.random().toString(36).slice(2)}`,
      scope: 'brands:read posts:draft',
      sub: 'user-123',
      ...claims,
    };
    for (const key of omit) {
      delete payload[key];
    }
    return new SignJWT(payload)
      .setProtectedHeader({
        alg: signAlg,
        kid: 'key-1',
        typ: 'oauth-id-jag+jwt',
        ...header,
      })
      .sign(privateKey);
  }

  return { issuerKeys, sign };
}
