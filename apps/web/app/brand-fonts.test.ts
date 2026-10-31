import fs from 'node:fs';
import path from 'node:path';
import { FONT_FAMILY_METADATA, FontFamily } from '@genfeedai/contracts';
import { describe, expect, it } from 'vitest';

const css = fs.readFileSync(path.join(__dirname, 'brand-fonts.css'), 'utf8');

describe('brand-fonts.css', () => {
  it.each(Object.values(FontFamily))(
    'declares a self-hosted @font-face for %s',
    (font) => {
      const { cssFamily, cssWeight, key } = FONT_FAMILY_METADATA[font];
      const block = css
        .split('@font-face')
        .find((candidate) =>
          candidate.includes(`/assets/fonts/brand/${key}.woff2`),
        );

      expect(block).toBeDefined();
      expect(block).toContain(`font-family: "${cssFamily}"`);
      expect(block).toContain(`font-weight: ${cssWeight}`);
      expect(
        fs.existsSync(
          path.join(__dirname, '../public/assets/fonts/brand', `${key}.woff2`),
        ),
      ).toBe(true);
    },
  );
});
