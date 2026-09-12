import { readToolsetsQueryParam } from '@mcp/shared/utils/toolsets-query.util';
import type { Request } from 'express';

/**
 * Unit coverage for the `?toolsets=` query-shape normalizer that sits in
 * front of `parseToolsetSelection`. Express's `qs` parser turns a bracketed
 * query key (`?toolsets[__proto__]=x`) into a nested object rather than a
 * string or string array, and this util is the boundary that must drop that
 * shape rather than forward it — `parseToolsetSelection` only understands a
 * string or an array of strings.
 */
describe('readToolsetsQueryParam', () => {
  it('passes through a single comma-separated string', () => {
    expect(
      readToolsetsQueryParam({
        toolsets: 'content,generation',
      } as unknown as Request['query']),
    ).toBe('content,generation');
  });

  it('filters a repeated query param down to its string entries', () => {
    expect(
      readToolsetsQueryParam({
        toolsets: ['content', 'generation'],
      } as unknown as Request['query']),
    ).toEqual(['content', 'generation']);
  });

  it('drops a bracketed/object query shape (?toolsets[__proto__]=x) instead of forwarding it', () => {
    // qs parses a bracketed key into a nested object — neither a string nor
    // a string array — so the util must drop it rather than pass an object
    // through to `parseToolsetSelection`, which only understands the two
    // shapes it explicitly handles.
    expect(
      readToolsetsQueryParam({
        toolsets: { x: 'y' },
      } as unknown as Request['query']),
    ).toBeUndefined();
  });

  it('drops an object shape even when the key is a genuine own "__proto__" property', () => {
    // `{ __proto__: ... }` as an object *literal* is special-cased by the
    // language (it sets the prototype rather than creating an own property),
    // so this uses JSON.parse to build an object with a real own property
    // named "__proto__" — the shape a naive downstream `{ ...raw }` spread
    // could turn into actual prototype pollution. This util must still just
    // see "not a string, not an array" and drop it.
    const polluted = JSON.parse('{"__proto__": {"polluted": true}}');

    expect(
      readToolsetsQueryParam({
        toolsets: polluted,
      } as unknown as Request['query']),
    ).toBeUndefined();
  });

  it('returns undefined when the query has no toolsets param', () => {
    expect(readToolsetsQueryParam({} as Request['query'])).toBeUndefined();
  });
});
