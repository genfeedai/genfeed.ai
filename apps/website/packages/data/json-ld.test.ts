import { describe, expect, it } from 'vitest';
import { stringifyJsonLd } from './json-ld';

describe('stringifyJsonLd', () => {
  it('escapes characters that can break out of JSON-LD script tags', () => {
    const serialized = stringifyJsonLd({
      description: '</script><img src=x onerror=alert(1)>&',
      lineSeparator: '\u2028',
      paragraphSeparator: '\u2029',
    });

    expect(serialized).not.toContain('</script>');
    expect(serialized).not.toContain('<img');
    expect(serialized).not.toContain('&');
    expect(serialized).toContain('\\u003c/script\\u003e');
    expect(serialized).toContain('\\u003cimg');
    expect(serialized).toContain('\\u0026');
    expect(serialized).toContain('\\u2028');
    expect(serialized).toContain('\\u2029');
    expect(JSON.parse(serialized)).toEqual({
      description: '</script><img src=x onerror=alert(1)>&',
      lineSeparator: '\u2028',
      paragraphSeparator: '\u2029',
    });
  });
});
