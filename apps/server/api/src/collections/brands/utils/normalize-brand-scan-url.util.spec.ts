import { normalizeBrandScanUrl } from '@api/collections/brands/utils/normalize-brand-scan-url.util';

describe('normalizeBrandScanUrl', () => {
  it.each([
    'https://example.com/#section',
    'https://example.com/#',
    'https://example.com/?api_key=secret',
    'a'.repeat(2049),
    'https://example.com/\u0001',
    'file:///etc/passwd',
  ])('rejects invalid scan input %s', (url) => {
    expect(() => normalizeBrandScanUrl(url)).toThrow();
  });
  it('normalizes a valid URL', () => {
    expect(normalizeBrandScanUrl(' https://EXAMPLE.com ')).toBe(
      'https://example.com/',
    );
  });
});
