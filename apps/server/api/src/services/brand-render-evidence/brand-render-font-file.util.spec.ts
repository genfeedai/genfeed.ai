import {
  assertBrandFontBytes,
  BRAND_FONT_MAX_BYTES,
  BRAND_FONT_MIN_BYTES,
  BrandFontFileError,
  isBrandFontFace,
  isBrandFontFamily,
  isBrandFontMimeType,
  sha256Hex,
} from '@api/services/brand-render-evidence/brand-render-font-file.util';
import { describe, expect, it } from 'vitest';

function file(header: Buffer, size = 256): Buffer {
  const bytes = Buffer.alloc(size, 7);
  header.copy(bytes);
  return bytes;
}
const sfnt = Buffer.from([0, 1, 0, 0]);
const FORMATS = [
  ['font/woff2', Buffer.from('wOF2', 'ascii')],
  ['font/woff', Buffer.from('wOFF', 'ascii')],
  ['font/ttf', sfnt],
  ['font/otf', Buffer.from('OTTO', 'ascii')],
] as const;

function expected(bytes: Buffer, mimeType: string) {
  return { mimeType, sha256: sha256Hex(bytes), sizeBytes: bytes.length };
}
function codeOf(run: () => void): string | undefined {
  try {
    run();
  } catch (error) {
    return error instanceof BrandFontFileError ? error.code : String(error);
  }
  return undefined;
}

describe('brand font files', () => {
  it.each(FORMATS)(
    'accepts a %s file whose bytes match the approval',
    (mime, header) => {
      const bytes = file(header);
      expect(() =>
        assertBrandFontBytes(bytes, expected(bytes, mime)),
      ).not.toThrow();
    },
  );

  it('accepts the Apple "true" TrueType tag', () => {
    const bytes = file(Buffer.from('true', 'ascii'));
    expect(() =>
      assertBrandFontBytes(bytes, expected(bytes, 'font/ttf')),
    ).not.toThrow();
  });

  it.each([
    'font/eot',
    'font/sfnt',
    'application/font-woff',
    'application/octet-stream',
    'image/png',
    'text/css',
    '',
  ])('rejects %s as a format', (mime) => {
    const bytes = file(sfnt);
    expect(isBrandFontMimeType(mime)).toBe(false);
    expect(
      codeOf(() => assertBrandFontBytes(bytes, expected(bytes, mime))),
    ).toBe('visual_brand_font_format_unsupported');
  });

  it('rejects a file over the size limit and one under the minimum', () => {
    const large = file(sfnt, BRAND_FONT_MAX_BYTES + 1);
    expect(
      codeOf(() => assertBrandFontBytes(large, expected(large, 'font/ttf'))),
    ).toBe('visual_brand_font_size_invalid');
    const tiny = file(sfnt, BRAND_FONT_MIN_BYTES - 1);
    expect(
      codeOf(() => assertBrandFontBytes(tiny, expected(tiny, 'font/ttf'))),
    ).toBe('visual_brand_font_size_invalid');
    const atLimit = file(sfnt, BRAND_FONT_MAX_BYTES);
    expect(() =>
      assertBrandFontBytes(atLimit, expected(atLimit, 'font/ttf')),
    ).not.toThrow();
  });

  it('rejects bytes whose length differs from the recorded size', () => {
    const bytes = file(sfnt);
    expect(
      codeOf(() =>
        assertBrandFontBytes(bytes, {
          ...expected(bytes, 'font/ttf'),
          sizeBytes: bytes.length - 1,
        }),
      ),
    ).toBe('visual_brand_font_size_invalid');
  });

  it('rejects a file that is not the format it is labelled as', () => {
    for (const [mime] of FORMATS) {
      const other = FORMATS.find(([candidate]) => candidate !== mime);
      const bytes = file(other?.[1] ?? Buffer.alloc(4));
      expect(
        codeOf(() => assertBrandFontBytes(bytes, expected(bytes, mime))),
      ).toBe('visual_brand_font_signature_mismatch');
    }
    const text = Buffer.from(`<svg>${'x'.repeat(100)}</svg>`);
    expect(
      codeOf(() => assertBrandFontBytes(text, expected(text, 'font/woff2'))),
    ).toBe('visual_brand_font_signature_mismatch');
  });

  it('rejects bytes that are not the file the revision approved', () => {
    const approved = file(Buffer.from('wOF2', 'ascii'));
    const tampered = Buffer.from(approved);
    tampered[100] ^= 1;
    expect(
      codeOf(() =>
        assertBrandFontBytes(tampered, expected(approved, 'font/woff2')),
      ),
    ).toBe('visual_brand_font_hash_mismatch');
  });
});

describe('brand font faces', () => {
  it.each(['Zodiak', 'IBM Plex Sans', 'DM-Sans', 'Söhne', 'Noto Sans JP', 'A'])(
    'allows the plain family name %s',
    (family) => expect(isBrandFontFamily(family)).toBe(true),
  );

  it.each([
    '',
    ' Leading',
    'Quote"Break',
    "Apostrophe'",
    'Back\\slash',
    'a;b',
    'a{b}',
    '</style>',
    'url(x)',
    'new\nline',
    'x'.repeat(101),
  ])('refuses %j as a family name', (family) =>
    expect(isBrandFontFamily(family)).toBe(false),
  );

  it('needs a whole weight from 100 to 900', () => {
    const face = { family: 'Zodiak', style: 'normal' as const };
    expect(isBrandFontFace({ ...face, weight: 400 })).toBe(true);
    for (const weight of [0, 99, 901, 400.5, Number.NaN])
      expect(isBrandFontFace({ ...face, weight })).toBe(false);
  });
});
