import {
  hasExplicitToolsetsQuery,
  readProfileQueryParam,
} from '@mcp/shared/utils/toolsets-query.util';
import type { Request } from 'express';

/**
 * Unit coverage for the `?toolsets=` query-shape normalizer that sits in
 * front of `parseToolsetSelection`. Express's `qs` parser turns a bracketed
 * query key (`?toolsets[__proto__]=x`) into a nested object rather than a
 * string or string array, and this util is the boundary that must drop that
 * shape rather than forward it — `parseToolsetSelection` only understands a
 * string or an array of strings.
 */

describe('hasExplicitToolsetsQuery', () => {
  it('is false for an absent or blank param and true once a name is present', () => {
    expect(hasExplicitToolsetsQuery(undefined)).toBe(false);
    expect(hasExplicitToolsetsQuery('')).toBe(false);
    expect(hasExplicitToolsetsQuery(' , ')).toBe(false);
    expect(hasExplicitToolsetsQuery('content')).toBe(true);
    expect(hasExplicitToolsetsQuery(['', 'goals'])).toBe(true);
  });
});

describe('readProfileQueryParam', () => {
  it('normalizes a single profile and drops a blank one', () => {
    expect(
      readProfileQueryParam({ profile: ' Directory ' } as Request['query']),
    ).toBe('directory');
    expect(readProfileQueryParam({ profile: '  ' } as Request['query'])).toBe(
      undefined,
    );
    expect(readProfileQueryParam({} as Request['query'])).toBeUndefined();
  });

  it('joins disagreeing repeated profile params so the caller fails closed', () => {
    expect(
      readProfileQueryParam({
        profile: ['full', 'directory'],
      } as unknown as Request['query']),
    ).toBe('full,directory');
  });
});
