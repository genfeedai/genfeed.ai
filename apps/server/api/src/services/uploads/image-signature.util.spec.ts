import { detectImageExtension } from '@api/services/uploads/image-signature.util';

const bytes = (...values: number[]): Uint8Array => Uint8Array.from(values);
const text = (value: string): Uint8Array => new TextEncoder().encode(value);

describe('detectImageExtension', () => {
  it.each([
    ['png', bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0)],
    ['jpg', bytes(0xff, 0xd8, 0xff, 0xe1, 0, 0)],
    ['gif', text('GIF89a\u0001\u0000')],
    ['gif', text('GIF87a\u0001\u0000')],
    ['webp', text('RIFF\u0010\u0000\u0000\u0000WEBPVP8 ')],
  ])('recognizes %s from its first bytes', (extension, head) => {
    expect(detectImageExtension(head)).toBe(extension);
  });

  it.each([
    ['SVG markup', text('<svg xmlns="http://www.w3.org/2000/svg">')],
    ['HTML', text('<!doctype html><html>')],
    [
      'a RIFF file that is not WebP',
      text('RIFF\u0010\u0000\u0000\u0000WAVEfmt '),
    ],
    ['too few bytes', bytes(0x89, 0x50)],
    ['nothing', bytes()],
  ])('refuses %s', (_label, head) => {
    expect(detectImageExtension(head)).toBeUndefined();
  });
});
