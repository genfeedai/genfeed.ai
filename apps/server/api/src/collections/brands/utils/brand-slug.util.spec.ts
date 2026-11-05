import { toBrandSlugBase } from '@api/collections/brands/utils/brand-slug.util';
import { describe, expect, it } from 'vitest';

describe('toBrandSlugBase', () => {
  it.each([
    ['Acme Studio', 'acme-studio'],
    ['  --Acme & Co.--  ', 'acme-co'],
    ['Café 2026', 'caf-2026'],
    ['!!!', ''],
  ])('%s -> %s', (label, expected) => {
    expect(toBrandSlugBase(label)).toBe(expected);
  });
});
