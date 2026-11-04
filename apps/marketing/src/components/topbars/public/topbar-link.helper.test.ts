import { describe, expect, it } from 'vitest';

import { isLinkActive } from './topbar-link.helper';

describe('isLinkActive', () => {
  it.each<[string | null, string, boolean]>([
    [null, '/', false],
    [null, '/pricing', false],
    ['/', '/', true],
    ['/pricing', '/', false],
    ['/pricing', '/pricing', true],
    ['/pricing/enterprise', '/pricing', true],
    ['/about', '/pricing', false],
  ])('pathname %s and href %s is %s', (pathname, href, expected) => {
    expect(isLinkActive(pathname, href)).toBe(expected);
  });
});
