import fs from 'node:fs';
import path from 'node:path';
import { resolveFontFile } from '@files/helpers/utils/font/font-file.util';
import { FontFamily } from '@genfeedai/contracts';
import { describe, expect, it } from 'vitest';

describe('resolveFontFile', () => {
  const fontDirectory = path.resolve(
    __dirname,
    '../../../../public/assets/fonts',
  );

  it('resolves a font key to its shipped TTF', () => {
    expect(resolveFontFile('poppins-bold')).toBe(
      path.join(fontDirectory, 'poppins-bold.ttf'),
    );
  });

  it('accepts the persisted enum label', () => {
    expect(resolveFontFile('BEBAS_NEUE')).toBe(
      path.join(fontDirectory, 'bebas-neue.ttf'),
    );
  });

  it('falls back to the default for unknown or unsafe values', () => {
    const fallback = path.join(fontDirectory, 'montserrat-black.ttf');
    expect(resolveFontFile('')).toBe(fallback);
    expect(resolveFontFile(undefined)).toBe(fallback);
    expect(resolveFontFile('comic-sans')).toBe(fallback);
    expect(resolveFontFile('../../../etc/passwd')).toBe(fallback);
  });

  it('ships a TTF for every font family', () => {
    for (const font of Object.values(FontFamily)) {
      const fileName = path.basename(resolveFontFile(font));
      expect(fs.existsSync(path.join(fontDirectory, fileName))).toBe(true);
    }
  });
});
