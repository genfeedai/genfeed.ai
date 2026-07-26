import { normalizeTrendSourceUrl } from '@api/collections/trends/utils/trend-source-url.util';

describe('normalizeTrendSourceUrl', () => {
  it('removes query, fragment, and one trailing slash from valid URLs', () => {
    expect(
      normalizeTrendSourceUrl(
        'https://example.com/reference/?campaign=launch#details',
      ),
    ).toEqual({
      normalizedUrl: 'https://example.com/reference',
      ok: true,
    });
  });

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

  it('preserves the original single-trailing-slash removal behavior', () => {
    expect(normalizeTrendSourceUrl('not a url////?query').normalizedUrl).toBe(
      'not a url///',
    );
  });

  it('drops every line after a delimiter in malformed multi-line input', () => {
    expect(
      normalizeTrendSourceUrl('not a url/reference?query\nuntrusted-line')
        .normalizedUrl,
    ).toBe('not a url/reference');
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
