import { libraryCacheIdentity } from '@api/collections/ingredients/utils/library-brand-scope.util';
import { describe, expect, it } from 'vitest';

describe('libraryCacheIdentity', () => {
  it('treats session callers as one identity', () => {
    expect(libraryCacheIdentity({})).toBe('session');
    expect(libraryCacheIdentity(undefined)).toBe('session');
  });

  it('separates API keys from sessions and from each other', () => {
    const adminKey = libraryCacheIdentity({
      apiKeyId: 'key-a',
      isApiKey: true,
      scopes: ['admin'],
    });
    const readKey = libraryCacheIdentity({
      apiKeyId: 'key-b',
      isApiKey: true,
      scopes: ['read'],
    });

    expect(adminKey).not.toBe('session');
    expect(adminKey).not.toBe(readKey);
  });

  it('is stable regardless of scope order', () => {
    expect(
      libraryCacheIdentity({
        apiKeyId: 'k',
        isApiKey: true,
        scopes: ['b', 'a'],
      }),
    ).toBe(
      libraryCacheIdentity({
        apiKeyId: 'k',
        isApiKey: true,
        scopes: ['a', 'b'],
      }),
    );
  });
});
