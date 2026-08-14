import { describe, expect, it } from 'vitest';
import {
  buildGrantedScopesCredentialPatch,
  parseGrantedOAuthScopes,
  readOAuthTokenScopeField,
} from './parse-granted-oauth-scopes.helper';

describe('parseGrantedOAuthScopes', () => {
  it('splits space-delimited OAuth scope strings', () => {
    expect(
      parseGrantedOAuthScopes('tweet.read tweet.write users.read'),
    ).toEqual(['tweet.read', 'tweet.write', 'users.read']);
  });

  it('splits comma-delimited grants and de-duplicates', () => {
    expect(
      parseGrantedOAuthScopes('video.list,user.info.basic,video.list'),
    ).toEqual(['user.info.basic', 'video.list']);
  });

  it('accepts string arrays and drops blanks', () => {
    expect(
      parseGrantedOAuthScopes([' w_member_social ', '', 'openid', 'openid']),
    ).toEqual(['openid', 'w_member_social']);
  });

  it('treats an empty captured string as an empty grant set', () => {
    expect(parseGrantedOAuthScopes('')).toEqual([]);
    expect(parseGrantedOAuthScopes('   ')).toEqual([]);
  });

  it('returns an empty list for non-scope values', () => {
    expect(parseGrantedOAuthScopes(undefined)).toEqual([]);
    expect(parseGrantedOAuthScopes(null)).toEqual([]);
    expect(parseGrantedOAuthScopes(12)).toEqual([]);
  });
});

describe('buildGrantedScopesCredentialPatch', () => {
  const capturedAt = new Date('2026-08-14T00:00:00.000Z');

  it('omits a patch when the provider did not return a scope field', () => {
    expect(
      buildGrantedScopesCredentialPatch(undefined, capturedAt),
    ).toBeUndefined();
    expect(buildGrantedScopesCredentialPatch(null, capturedAt)).toBeUndefined();
  });

  it('persists a captured empty grant so it is distinct from never captured', () => {
    expect(buildGrantedScopesCredentialPatch('', capturedAt)).toEqual({
      grantedScopes: [],
      grantedScopesCapturedAt: capturedAt,
    });
  });

  it('persists the normalized grant set from a token response', () => {
    expect(
      buildGrantedScopesCredentialPatch('tweet.read tweet.write', capturedAt),
    ).toEqual({
      grantedScopes: ['tweet.read', 'tweet.write'],
      grantedScopesCapturedAt: capturedAt,
    });
  });
});

describe('readOAuthTokenScopeField', () => {
  it('returns undefined when the token payload has no scope field', () => {
    expect(readOAuthTokenScopeField({ access_token: 'tok' })).toBeUndefined();
    expect(readOAuthTokenScopeField(undefined)).toBeUndefined();
  });

  it('returns the raw scope field so empty grants can still be captured', () => {
    expect(readOAuthTokenScopeField({ scope: '' })).toBe('');
    expect(readOAuthTokenScopeField({ scope: 'tweet.write' })).toBe(
      'tweet.write',
    );
  });
});
