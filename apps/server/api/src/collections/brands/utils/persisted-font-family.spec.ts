import { FontFamily } from '@genfeedai/contracts';
import { describe, expect, it } from 'vitest';
import { toPersistedFontFamily } from './persisted-font-family';

describe('toPersistedFontFamily', () => {
  it('keeps a stored FontFamily label', () => {
    expect(toPersistedFontFamily(FontFamily.MONTSERRAT_REGULAR)).toBe(
      FontFamily.MONTSERRAT_REGULAR,
    );
  });

  it('normalizes a spaced or hyphenated enum label', () => {
    expect(toPersistedFontFamily('montserrat-black')).toBe(
      FontFamily.MONTSERRAT_BLACK,
    );
    expect(toPersistedFontFamily('Montserrat Bold')).toBe(
      FontFamily.MONTSERRAT_BOLD,
    );
  });

  it('drops CSS font stacks that are not a FontFamily member', () => {
    expect(toPersistedFontFamily('-apple-system')).toBeUndefined();
    expect(toPersistedFontFamily('system-ui')).toBeUndefined();
    expect(toPersistedFontFamily('Inter, sans-serif')).toBeUndefined();
    expect(toPersistedFontFamily('')).toBeUndefined();
    expect(toPersistedFontFamily(undefined)).toBeUndefined();
  });
});
