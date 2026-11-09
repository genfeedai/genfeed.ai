import { buildGenfeedProfileReadiness } from '@api/collections/credentials/utils/genfeed-profile-readiness.util';
import { describe, expect, it } from 'vitest';

const checkedAt = '2026-11-09T10:00:00.000Z';
const publicBrand = { isDeleted: false, scope: 'PUBLIC' };

describe('buildGenfeedProfileReadiness', () => {
  it('is ready for a switched-on channel of a public brand', () => {
    const readiness = buildGenfeedProfileReadiness({
      brand: publicBrand,
      checkedAt,
      credentialId: 'cred-gf',
      isConnected: true,
    });

    expect(readiness).toMatchObject({
      canSchedule: true,
      credentialId: 'cred-gf',
      diagnostics: [],
      providerKey: 'genfeed',
      tokenFreshness: 'pass',
    });
  });

  it.each([
    [
      'a switched-off channel',
      publicBrand,
      false,
      'genfeed_profile_channel_off',
    ],
    [
      'a private brand',
      { isDeleted: false, scope: 'ORGANIZATION' },
      true,
      'genfeed_profile_private',
    ],
    [
      'a deleted brand',
      { isDeleted: true, scope: 'PUBLIC' },
      true,
      'genfeed_profile_private',
    ],
    ['a missing brand', null, true, 'genfeed_profile_private'],
  ])('blocks %s', (_name, brand, isConnected, code) => {
    const readiness = buildGenfeedProfileReadiness({
      brand,
      checkedAt,
      credentialId: 'cred-gf',
      isConnected,
    });

    expect(readiness.canSchedule).toBe(false);
    expect(readiness.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      code,
    ]);
  });
});
