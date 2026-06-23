import { beforeEach, describe, expect, it, vi } from 'vitest';

const createRemoteJWKSetMock = vi.hoisted(() => vi.fn(() => 'jwks'));
const jwtVerifyMock = vi.hoisted(() => vi.fn());

vi.mock('jose', () => ({
  createRemoteJWKSet: createRemoteJWKSetMock,
  jwtVerify: jwtVerifyMock,
}));

import {
  BetterAuthJwksVerifier,
  createBetterAuthJwksVerifierOptions,
  normalizeBetterAuthBaseUrl,
  resolveBetterAuthJwksUrl,
} from './better-auth-jwks.verifier';

describe('BetterAuthJwksVerifier', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('normalizes the base URL used for issuer, audience, and JWKS URL', () => {
    expect(normalizeBetterAuthBaseUrl('https://api.genfeed.ai///')).toBe(
      'https://api.genfeed.ai',
    );
    expect(resolveBetterAuthJwksUrl('https://api.genfeed.ai///')).toBe(
      'https://api.genfeed.ai/v1/auth/jwks',
    );
    expect(
      createBetterAuthJwksVerifierOptions('https://api.genfeed.ai///'),
    ).toEqual({
      audience: 'https://api.genfeed.ai',
      issuer: 'https://api.genfeed.ai',
      jwksUrl: 'https://api.genfeed.ai/v1/auth/jwks',
    });
  });

  it('verifies signature and issuer/audience claims against the configured base URL', async () => {
    jwtVerifyMock.mockResolvedValue({
      payload: {
        organizationId: 'org-123',
        sub: 'user-123',
      },
    });
    const verifier = new BetterAuthJwksVerifier(
      createBetterAuthJwksVerifierOptions('https://api.genfeed.ai/'),
    );

    await expect(verifier.verify('jwt-token')).resolves.toEqual({
      organizationId: 'org-123',
      sub: 'user-123',
    });

    expect(createRemoteJWKSetMock).toHaveBeenCalledOnce();
    expect(createRemoteJWKSetMock.mock.calls[0][0].toString()).toBe(
      'https://api.genfeed.ai/v1/auth/jwks',
    );
    expect(jwtVerifyMock).toHaveBeenCalledWith('jwt-token', 'jwks', {
      audience: 'https://api.genfeed.ai',
      issuer: 'https://api.genfeed.ai',
    });
  });

  it('rejects tokens without a subject claim after jose verification', async () => {
    jwtVerifyMock.mockResolvedValue({ payload: {} });
    const verifier = new BetterAuthJwksVerifier(
      createBetterAuthJwksVerifierOptions('https://api.genfeed.ai'),
    );

    await expect(verifier.verify('jwt-token')).rejects.toThrow(
      'Better Auth JWT is missing a subject (sub) claim',
    );
  });
});
