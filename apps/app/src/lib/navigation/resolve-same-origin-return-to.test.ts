import { describe, expect, it } from 'vitest';
import { resolveSameOriginReturnTo } from './resolve-same-origin-return-to';

const DEFAULT_PATH = '/settings/api-keys';

describe('resolveSameOriginReturnTo', () => {
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
});
