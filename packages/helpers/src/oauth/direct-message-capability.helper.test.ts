import { describe, expect, it } from 'vitest';
import { resolveDirectMessageCapability } from './direct-message-capability.helper';

const CAPTURED_AT = new Date('2026-10-20T00:00:00.000Z');

describe('resolveDirectMessageCapability', () => {
  it.each([
    {
      expected: 'ok',
      grantedScopes: ['dm.read', 'tweet.read', 'tweet.write'],
      grantedScopesCapturedAt: CAPTURED_AT,
      name: 'X grant with dm.read',
    },
    {
      expected: 'reconnect',
      grantedScopes: ['tweet.read', 'tweet.write', 'users.read'],
      grantedScopesCapturedAt: CAPTURED_AT,
      name: 'X grant captured without dm.read',
    },
    {
      expected: 'reconnect',
      grantedScopes: [],
      grantedScopesCapturedAt: '2026-10-20T00:00:00.000Z',
      name: 'X grant captured empty',
    },
    {
      expected: 'unknown',
      grantedScopes: [],
      grantedScopesCapturedAt: null,
      name: 'X grant from before scope capture',
    },
  ])('$name → $expected', ({ expected, ...input }) => {
    expect(
      resolveDirectMessageCapability({ ...input, platform: 'twitter' }),
    ).toBe(expected);
  });

  it('has no DM capability for platforms without a DM scope requirement', () => {
    expect(
      resolveDirectMessageCapability({
        grantedScopes: ['w_member_social'],
        grantedScopesCapturedAt: CAPTURED_AT,
        platform: 'linkedin',
      }),
    ).toBeUndefined();
  });
});
