import { assertKeyWithinCaller } from '@api/collections/api-keys/utils/api-key-escalation.util';

const callerKey = {
  allowedIps: [],
  expiresAt: null,
  metadata: { allowedBrandIds: ['brand-a', 'brand-b'] },
  scopes: ['images:read'],
};

describe('a brand-restricted key managing other keys (#9130)', () => {
  it.each([
    ['one of its brands', ['brand-a']],
    ['all of its brands', ['brand-a', 'brand-b']],
  ])('may create a key limited to %s', (_case, allowedBrandIds) => {
    expect(() =>
      assertKeyWithinCaller(callerKey, { allowedBrandIds }, true),
    ).not.toThrow();
  });

  it.each([
    ['no brand limit', undefined],
    ['a brand it does not reach', ['brand-c']],
    ['an empty list', []],
  ])('may not create a key with %s', (_case, allowedBrandIds) => {
    expect(() =>
      assertKeyWithinCaller(callerKey, { allowedBrandIds }, true),
    ).toThrow(
      expect.objectContaining({
        response: {
          detail:
            'A brand-restricted API key can only create keys restricted to a subset of its brands.',
          title: 'API key privilege escalation',
        },
      }),
    );
  });

  it('lets an unrestricted key create a key for every brand', () => {
    expect(() =>
      assertKeyWithinCaller({ ...callerKey, metadata: null }, {}, true),
    ).not.toThrow();
  });
});
