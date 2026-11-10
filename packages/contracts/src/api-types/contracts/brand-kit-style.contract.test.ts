import { describe, expect, it } from 'vitest';
import {
  brandFontRolesSchema,
  brandPaletteSchema,
  readBrandFontRoles,
  readBrandPalette,
} from './brand-kit-style.contract';

const uploaded = {
  source: 'upload',
  assetId: 'font-1',
  contentHash: `sha256:${'a'.repeat(64)}`,
  family: 'Acme Display',
  weight: 700,
  style: 'normal',
};

describe('brand palette', () => {
  it('stores hex values in upper case', () => {
    expect(
      brandPaletteSchema.parse([
        { name: 'Accent', hex: '#ff6600', usage: 'Buttons' },
      ]),
    ).toEqual([{ name: 'Accent', hex: '#FF6600', usage: 'Buttons' }]);
  });

  it.each([
    ['a short hex', [{ name: 'Accent', hex: '#f60' }]],
    ['a color without a name', [{ name: ' ', hex: '#FF6600' }]],
    [
      'two colors with the same name',
      [
        { name: 'Accent', hex: '#FF6600' },
        { name: 'accent', hex: '#000000' },
      ],
    ],
    [
      'more than 29 colors',
      Array.from({ length: 30 }, (_, index) => ({
        name: `Color ${index}`,
        hex: '#000000',
      })),
    ],
  ])('refuses %s', (_case, palette) => {
    expect(brandPaletteSchema.safeParse(palette).success).toBe(false);
  });

  it('reads a stored value that is not a palette as no colors', () => {
    expect(readBrandPalette({ accent: '#FF6600' })).toEqual([]);
  });
});

describe('brand font roles', () => {
  it('accepts an uploaded font and a built-in font', () => {
    expect(
      brandFontRolesSchema.parse({
        heading: uploaded,
        body: { source: 'preset', fontFamily: 'INTER_BOLD' },
      }),
    ).toEqual({
      heading: uploaded,
      body: { source: 'preset', fontFamily: 'INTER_BOLD' },
    });
  });

  it.each([
    ['an unknown role', { title: uploaded }],
    [
      'a built-in font Genfeed does not ship',
      { body: { source: 'preset', fontFamily: 'COMIC_SANS' } },
    ],
    ['a weight off the 100 scale', { heading: { ...uploaded, weight: 450 } }],
    [
      'an uploaded font without its hash',
      { heading: { ...uploaded, contentHash: 'abc' } },
    ],
  ])('refuses %s', (_case, roles) => {
    expect(brandFontRolesSchema.safeParse(roles).success).toBe(false);
  });

  it('reads a stored value that is not valid as no roles', () => {
    expect(readBrandFontRoles([])).toEqual({});
  });
});
