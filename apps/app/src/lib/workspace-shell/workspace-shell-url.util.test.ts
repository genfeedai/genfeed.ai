import { describe, expect, it } from 'vitest';
import {
  parseInternalHref,
  toRelativeHref,
} from '@/lib/workspace-shell/workspace-shell-url.util';

describe('workspace shell URL policy', () => {
  it.each([
    ['/acme/library', '/acme/library'],
    ['acme/library', '/acme/library'],
    ['', '/'],
    ['#asset-grid', '/#asset-grid'],
    ['https://workspace.genfeed.invalid/acme/library', '/acme/library'],
    ['//workspace.genfeed.invalid/acme/library', '/acme/library'],
    ['https://WORKSPACE.genfeed.invalid:443/acme/library', '/acme/library'],
    ['/acme/old/../library/./images', '/acme/library/images'],
    [String.raw`\acme\library`, '/acme/library'],
    ['/acme/li\nbrary', '/acme/library'],
    [
      '/acme/a%2Fb?z=%2f&a=one+two&a=%20&opaque=%2526#asset%2fgrid',
      '/acme/a%2Fb?z=%2f&a=one+two&a=%20&opaque=%2526#asset%2fgrid',
    ],
    [
      'https://workspace.genfeed.invalid/acme/library?b=2&a=%2f&a=+#part%20one',
      '/acme/library?b=2&a=%2f&a=+#part%20one',
    ],
  ])(
    'parses and serializes the existing internal destination %j',
    (href, expected) => {
      const url = parseInternalHref(href);

      expect(url).toBeInstanceOf(URL);
      if (!url) {
        throw new Error('Expected an accepted internal URL');
      }
      expect(toRelativeHref(url)).toBe(expected);
    },
  );

  it.each([
    'https://example.com/acme/library',
    '//example.com/acme/library',
    'http://workspace.genfeed.invalid/acme/library',
    'https://workspace.genfeed.invalid:444/acme/library',
    'https://workspace.genfeed.invalid.example.com/acme/library',
    'https://workspace.genfeed.invalid@evil.example/acme/library',
    'javascript:alert(1)',
    'https://[invalid',
  ])('rejects an external or unparseable destination %j', (href) => {
    expect(parseInternalHref(href)).toBeNull();
  });

  it('serializes the current pathname, search and fragment after URL mutation', () => {
    const url = new URL(
      'https://workspace.genfeed.invalid/old?opaque=%2f#asset%2fgrid',
    );
    url.pathname = '/acme/library';

    expect(toRelativeHref(url)).toBe('/acme/library?opaque=%2f#asset%2fgrid');
  });
});
