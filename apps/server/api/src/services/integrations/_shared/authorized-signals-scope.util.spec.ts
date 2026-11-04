import { describe, expect, it } from 'vitest';
import {
  buildAuthorizedSignalsScope,
  hasStoredScopeObservation,
  resolveAuthorizedGrantedScopes,
} from './authorized-signals-scope.util';

const storageKey = 'fooAuthorization';
const warmupSignals = (grantedScopes: unknown) => ({
  [storageKey]: { grantedScopes },
});
const credential = (signals: unknown) =>
  ({ warmupSignals: signals }) as Parameters<
    typeof hasStoredScopeObservation
  >[0]['credential'];

describe('buildAuthorizedSignalsScope', () => {
  it('splits required scopes into granted and missing', () => {
    expect(buildAuthorizedSignalsScope(['a', 'b'], ['b', 'c'])).toEqual({
      granted: ['b'],
      missing: ['a'],
      required: ['a', 'b'],
    });
  });

  it('reports nothing granted or missing when nothing is required', () => {
    expect(buildAuthorizedSignalsScope([], ['a'])).toEqual({
      granted: [],
      missing: [],
      required: [],
    });
  });
});

describe('resolveAuthorizedGrantedScopes', () => {
  const base = {
    authorizationStorageKey: storageKey,
    credential: credential(warmupSignals(['stored.scope'])),
    credentialScopes: ['credential.scope'],
    previousSnapshot: { grantedScopes: ['previous.scope'] },
  };

  it.each([
    [
      'explicit scopes',
      { ...base, explicitScopes: ['explicit.scope'] },
      ['explicit.scope'],
    ],
    [
      'credential scopes',
      { ...base, explicitScopes: undefined },
      ['credential.scope'],
    ],
    [
      'stored authorization when the credential has none',
      { ...base, credentialScopes: [], explicitScopes: undefined },
      ['stored.scope'],
    ],
    [
      'stored authorization when credential scopes are not captured',
      { ...base, credentialScopes: undefined, explicitScopes: undefined },
      ['stored.scope'],
    ],
    [
      'the previous snapshot as the last resort',
      {
        ...base,
        credential: credential(null),
        credentialScopes: undefined,
        explicitScopes: undefined,
      },
      ['previous.scope'],
    ],
    [
      'nothing when no source has scopes',
      {
        ...base,
        credential: credential(null),
        credentialScopes: undefined,
        explicitScopes: undefined,
        previousSnapshot: undefined,
      },
      [],
    ],
  ])('prefers %s', (_label, params, expected) => {
    expect(resolveAuthorizedGrantedScopes(params)).toEqual(expected);
  });

  it('parses a space-separated explicit scope string', () => {
    expect(
      resolveAuthorizedGrantedScopes({
        ...base,
        explicitScopes: 'one.scope two.scope',
      }),
    ).toEqual(['one.scope', 'two.scope']);
  });
});

describe('hasStoredScopeObservation', () => {
  const base = {
    authorizationStorageKey: storageKey,
    credential: credential(null),
    previousSnapshot: undefined,
  };

  it.each([
    ['nothing was observed', base, false],
    [
      'credential scopes were captured',
      { ...base, credentialScopes: ['a'] },
      true,
    ],
    [
      'empty credential scopes are ignored',
      { ...base, credentialScopes: [] },
      false,
    ],
    [
      'an authorization record exists, even an empty one',
      { ...base, credential: credential(warmupSignals([])) },
      true,
    ],
    [
      'a previous snapshot exists',
      { ...base, previousSnapshot: { grantedScopes: [] } },
      true,
    ],
  ])('is derived correctly when %s', (_label, params, expected) => {
    expect(hasStoredScopeObservation(params)).toBe(expected);
  });
});
