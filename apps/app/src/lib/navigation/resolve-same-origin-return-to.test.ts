import { describe, expect, it } from 'vitest';
import { resolveSameOriginReturnTo } from './resolve-same-origin-return-to';

const DEFAULT_PATH = '/settings/api-keys';

describe('resolveSameOriginReturnTo', () => {
  it('rejects a protocol-relative URL', () => {
    expect(resolveSameOriginReturnTo('//evil.com', DEFAULT_PATH)).toBe(
      DEFAULT_PATH,
    );
  });

  it('rejects a backslash-prefixed path treated as protocol-relative by browsers', () => {
    expect(resolveSameOriginReturnTo('/\\evil.com', DEFAULT_PATH)).toBe(
      DEFAULT_PATH,
    );
  });

  it('rejects an absolute off-origin URL', () => {
    expect(resolveSameOriginReturnTo('https://evil.com/x', DEFAULT_PATH)).toBe(
      DEFAULT_PATH,
    );
  });

  it('rejects a value carrying a non-http scheme', () => {
    expect(resolveSameOriginReturnTo('javascript:alert(1)', DEFAULT_PATH)).toBe(
      DEFAULT_PATH,
    );
  });

  it('rejects an empty string', () => {
    expect(resolveSameOriginReturnTo('', DEFAULT_PATH)).toBe(DEFAULT_PATH);
  });

  it('rejects undefined', () => {
    expect(resolveSameOriginReturnTo(undefined, DEFAULT_PATH)).toBe(
      DEFAULT_PATH,
    );
  });

  it('rejects null', () => {
    expect(resolveSameOriginReturnTo(null, DEFAULT_PATH)).toBe(DEFAULT_PATH);
  });

  it('rejects a path containing a backslash anywhere', () => {
    expect(resolveSameOriginReturnTo('/settings\\evil.com', DEFAULT_PATH)).toBe(
      DEFAULT_PATH,
    );
  });

  it('rejects a path containing control characters', () => {
    expect(resolveSameOriginReturnTo('/settings\n/evil', DEFAULT_PATH)).toBe(
      DEFAULT_PATH,
    );
  });

  it('rejects a value without a leading slash', () => {
    expect(resolveSameOriginReturnTo('settings/api-keys', DEFAULT_PATH)).toBe(
      DEFAULT_PATH,
    );
  });

  it('accepts a same-origin relative path and preserves its query string', () => {
    expect(resolveSameOriginReturnTo('/settings?x=1', DEFAULT_PATH)).toBe(
      '/settings?x=1',
    );
  });

  it('accepts a plain same-origin relative path', () => {
    expect(
      resolveSameOriginReturnTo('/settings/publishing', DEFAULT_PATH),
    ).toBe('/settings/publishing');
  });
});
