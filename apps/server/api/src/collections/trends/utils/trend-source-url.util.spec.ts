import { normalizeTrendSourceUrl } from '@api/collections/trends/utils/trend-source-url.util';

describe('normalizeTrendSourceUrl', () => {
  it('falls back to deterministic delimiter scanning for invalid URLs', () => {
    const result = normalizeTrendSourceUrl(
      'not a url/reference/?campaign=launch#details',
    );

    expect(result.ok).toBe(false);
    expect(result.normalizedUrl).toBe('not a url/reference');
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(Error);
    }
  });

  it('handles long delimiter tails without regular-expression backtracking', () => {
    const path = `not a url/${'a'.repeat(50_000)}`;
    const result = normalizeTrendSourceUrl(
      `${path}?${'#'.repeat(50_000)}ignored`,
    );

    expect(result.normalizedUrl).toBe(path);
    expect(result.ok).toBe(false);
  });
});
