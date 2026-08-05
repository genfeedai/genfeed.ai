import { describe, expect, it } from 'vitest';

import { extractUserIds } from './user-extraction.util';

describe('extractUserIds', () => {
  it('returns empty object when userField is undefined', () => {
    expect(extractUserIds(undefined)).toEqual({});
  });

  it('extracts every user identity field from a scalar ID', () => {
    const id = '507f191e810c19729de860ee';
    const result = extractUserIds(id);
    expect(result.dbUserId).toBe(id);
    expect(result.authProviderUserId).toBe(id);
    expect(result.userId).toBe(id);
    expect(result.userRoom).toBe(`user:${id}`);
  });

  it('extracts every user identity field from a populated user', () => {
    const id = '507f191e810c19729de860ee';
    const result = extractUserIds({ id });
    expect(result.dbUserId).toBe(id);
    expect(result.authProviderUserId).toBe(id);
    expect(result.userId).toBe(id);
    expect(result.userRoom).toBe(`user:${id}`);
  });

  it('returns no identities for a populated document without an id', () => {
    expect(extractUserIds({})).toEqual({});
  });
});
