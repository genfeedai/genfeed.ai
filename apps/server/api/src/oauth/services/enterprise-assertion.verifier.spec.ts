import { SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import {
  buildIssuerFixture,
  FIXTURE_AUDIENCE,
  FIXTURE_CLIENT_ID,
  FIXTURE_ISSUER,
} from './enterprise-assertion.fixture';
import {
  EnterpriseAssertionError,
  EnterpriseAssertionVerifier,
} from './enterprise-assertion.verifier';

const expected = {
  audience: FIXTURE_AUDIENCE,
  clientId: FIXTURE_CLIENT_ID,
  issuer: FIXTURE_ISSUER,
};

const nowSeconds = () => Math.floor(Date.now() / 1000);

describe('EnterpriseAssertionVerifier', () => {
  it.each(['ES256', 'RS256'] as const)(
    'accepts a valid %s assertion and returns its claims',
    async (alg) => {
      const { issuerKeys, sign } = await buildIssuerFixture(alg);
      const verifier = new EnterpriseAssertionVerifier(issuerKeys);
      const assertion = await sign({
        claims: { aud_tenant: 'org-1', jti: 'jti-1' },
      });

      await expect(verifier.verify(assertion, expected)).resolves.toMatchObject(
        {
          audTenant: 'org-1',
          clientId: FIXTURE_CLIENT_ID,
          email: 'Alex@Acme.example',
          issuer: FIXTURE_ISSUER,
          jti: 'jti-1',
          resources: [],
          scope: 'brands:read posts:draft',
        },
      );
    },
  );

  it('reads the unverified issuer and tenant for routing', async () => {
    const { issuerKeys, sign } = await buildIssuerFixture();
    const verifier = new EnterpriseAssertionVerifier(issuerKeys);

    expect(
      verifier.peek(await sign({ claims: { aud_tenant: 'org-9' } })),
    ).toEqual({ audTenant: 'org-9', issuer: FIXTURE_ISSUER });
    expect(() => verifier.peek('not-a-jwt')).toThrow(EnterpriseAssertionError);
  });

  it.each([
    ['a different audience', { claims: { aud: ['https://other.example'] } }],
    [
      'two audiences',
      { claims: { aud: [FIXTURE_AUDIENCE, 'https://x.example'] } },
    ],
    ['a different client', { claims: { client_id: 'someone-else' } }],
    ['a different issuer', { claims: { iss: 'https://evil.example' } }],
    ['an expired assertion', { claims: { exp: nowSeconds() - 600 } }],
    [
      'an assertion issued in the future',
      { claims: { iat: nowSeconds() + 600, exp: nowSeconds() + 700 } },
    ],
    ['a lifetime beyond an hour', { claims: { exp: nowSeconds() + 7200 } }],
    ['a not-yet-valid assertion', { claims: { nbf: nowSeconds() + 600 } }],
    ['a sender-constrained assertion', { claims: { cnf: { jkt: 'abc' } } }],
    ['no jti', { omit: ['jti'] }],
    ['no subject', { omit: ['sub'] }],
    ['no email', { omit: ['email'] }],
    ['the wrong typ', { header: { typ: 'JWT' } }],
    ['no typ', { header: { typ: undefined } }],
    ['a non-string scope', { claims: { scope: ['read'] } }],
  ])('rejects %s', async (_label, options) => {
    const { issuerKeys, sign } = await buildIssuerFixture();
    const verifier = new EnterpriseAssertionVerifier(issuerKeys);

    await expect(
      verifier.verify(await sign(options), expected),
    ).rejects.toBeInstanceOf(EnterpriseAssertionError);
  });

  it('rejects an assertion signed by a key the issuer does not publish', async () => {
    const trusted = await buildIssuerFixture();
    const attacker = await buildIssuerFixture();
    const verifier = new EnterpriseAssertionVerifier(trusted.issuerKeys);

    await expect(
      verifier.verify(await attacker.sign(), expected),
    ).rejects.toBeInstanceOf(EnterpriseAssertionError);
  });

  it('rejects HMAC and unsigned algorithms', async () => {
    const { issuerKeys } = await buildIssuerFixture();
    const verifier = new EnterpriseAssertionVerifier(issuerKeys);
    const claims = {
      aud: [FIXTURE_AUDIENCE],
      client_id: FIXTURE_CLIENT_ID,
      email: 'alex@acme.example',
      iss: FIXTURE_ISSUER,
      jti: 'hmac-1',
      sub: 'user-123',
    };
    const hmac = await new SignJWT(claims)
      .setProtectedHeader({
        alg: 'HS256',
        kid: 'key-1',
        typ: 'oauth-id-jag+jwt',
      })
      .setIssuedAt()
      .setExpirationTime('1m')
      .sign(new TextEncoder().encode('0'.repeat(32)));
    const unsigned = [
      Buffer.from(
        JSON.stringify({ alg: 'none', typ: 'oauth-id-jag+jwt' }),
      ).toString('base64url'),
      Buffer.from(
        JSON.stringify({
          ...claims,
          exp: nowSeconds() + 60,
          iat: nowSeconds(),
        }),
      ).toString('base64url'),
      '',
    ].join('.');

    await expect(verifier.verify(hmac, expected)).rejects.toBeInstanceOf(
      EnterpriseAssertionError,
    );
    await expect(verifier.verify(unsigned, expected)).rejects.toBeInstanceOf(
      EnterpriseAssertionError,
    );
  });
});
