import { describe, expect, it } from 'vitest';
import { resolveLibraryTagColors } from './library-tag-colors.util';

describe('resolveLibraryTagColors', () => {
  it('keeps the chosen colors while the text reads against the background', () => {
    expect(
      resolveLibraryTagColors({
        backgroundColor: '#000000',
        textColor: '#ffffff',
      }),
    ).toEqual({ backgroundColor: '#000000', textColor: '#ffffff' });
    expect(
      resolveLibraryTagColors({
        backgroundColor: '#fff',
        textColor: '#111111',
      }),
    ).toEqual({ backgroundColor: '#fff', textColor: '#111111' });
  });

  it('replaces a low-contrast text color with black on a light background', () => {
    expect(
      resolveLibraryTagColors({
        backgroundColor: '#ffff00',
        textColor: '#ffffff',
      }),
    ).toEqual({ backgroundColor: '#ffff00', textColor: '#000000' });
  });

  it('replaces a low-contrast text color with white on a dark background', () => {
    expect(
      resolveLibraryTagColors({
        backgroundColor: '#101010',
        textColor: '#202020',
      }),
    ).toEqual({ backgroundColor: '#101010', textColor: '#ffffff' });
  });

  it('chooses a readable text color when none was given', () => {
    expect(
      resolveLibraryTagColors({ backgroundColor: '#ff0000' })?.textColor,
    ).toBe('#000000');
    expect(
      resolveLibraryTagColors({ backgroundColor: '#003366', textColor: null })
        ?.textColor,
    ).toBe('#ffffff');
  });

  it('replaces an unparseable text color', () => {
    expect(
      resolveLibraryTagColors({
        backgroundColor: '#000000',
        textColor: 'rebeccapurple',
      })?.textColor,
    ).toBe('#ffffff');
  });

  it('falls back to the neutral surface for a background it cannot read', () => {
    for (const backgroundColor of [
      undefined,
      null,
      '',
      'red',
      'hsl(0 0% 0%)',
    ]) {
      expect(
        resolveLibraryTagColors({ backgroundColor, textColor: '#ffffff' }),
      ).toBeNull();
    }
  });

  it('meets AA contrast for every grey a member could pick', () => {
    for (let level = 0; level <= 255; level += 15) {
      const hex = `#${level.toString(16).padStart(2, '0').repeat(3)}`;
      const colors = resolveLibraryTagColors({
        backgroundColor: hex,
        textColor: hex,
      });

      expect(colors?.textColor).toMatch(/^#(000000|ffffff)$/);
    }
  });
});
