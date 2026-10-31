import { afterEach, describe, expect, it } from 'vitest';

import { hostPaletteProperties, readHostPalette } from '~theme/host-palette';

function paint(background: string, color: string): void {
  document.body.style.backgroundColor = background;
  document.body.style.color = color;
}

describe('host page palette', () => {
  afterEach(() => {
    document.body.removeAttribute('style');
    document.documentElement.removeAttribute('style');
  });

  it.each([
    ['Lights out', 'rgb(0, 0, 0)', 'rgb(231, 233, 234)', true],
    ['Dim', 'rgb(21, 32, 43)', 'rgb(247, 249, 249)', true],
    ['Default', 'rgb(255, 255, 255)', 'rgb(15, 20, 25)', false],
  ])(
    'reads X %s from the page background',
    (_name, background, text, isDark) => {
      paint(background, text);

      expect(readHostPalette()).toEqual({ background, isDark, text });
    },
  );

  it('falls back to a readable text colour when the page text clashes', () => {
    paint('rgb(0, 0, 0)', 'rgb(0, 0, 0)');

    expect(readHostPalette()?.text).toBe('rgb(231, 233, 234)');
  });

  it('reads the root background when the body has none', () => {
    document.documentElement.style.backgroundColor = 'rgb(0, 0, 0)';

    expect(readHostPalette()?.isDark).toBe(true);
  });

  it('returns null when the page paints no solid background', () => {
    expect(readHostPalette()).toBeNull();
  });

  it('derives the surface colours from the page background and text', () => {
    const properties = hostPaletteProperties({
      background: 'rgb(0, 0, 0)',
      isDark: true,
      text: 'rgb(231, 233, 234)',
    });

    expect(properties['--card']).toBe('rgb(0, 0, 0)');
    expect(properties['--text']).toBe('rgb(231, 233, 234)');
    expect(properties['--border']).toContain('var(--card)');
  });
});
