import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import {
  computeBrandFontUploadId,
  encodeBrandFontCursor,
  FONT_UPLOAD_MAX_BYTES,
  normalizeBrandFontFileName,
  parseBrandFontCursor,
  validateBrandFontUpload,
} from '@api/collections/brands/utils/brand-font-upload.util';

function file(size = 48): Express.Multer.File {
  const buffer = Buffer.alloc(size);
  buffer.write('wOF2');
  return {
    buffer,
    size,
    originalname: 'Acme.WOFF2',
    mimetype: 'font/woff2',
    fieldname: 'file',
    encoding: '7bit',
    destination: '',
    filename: '',
    path: '',
    stream: Readable.from([]),
  };
}
const requestId = '1254ff7f-367d-4cda-af62-1c666a73fc8f';
describe('Brand font byte and cursor admission', () => {
  it('preserves raw bytes, hashes them and uses only normalized metadata', () => {
    const source = file();
    const result = validateBrandFontUpload({
      file: source,
      requestId,
      displayName: ' Acme ',
    });
    expect(result.buffer).toBe(source.buffer);
    expect(result.sha256).toBe(
      createHash('sha256').update(source.buffer).digest('hex'),
    );
    expect(result.displayName).toBe('Acme');
    expect(
      validateBrandFontUpload({ file: source, requestId }).displayName,
    ).toBeNull();
  });
  it.each([47, FONT_UPLOAD_MAX_BYTES + 1])(
    'rejects authoritative buffer length %s',
    (size) => {
      expect(() =>
        validateBrandFontUpload({ file: file(size), requestId }),
      ).toThrow('font_asset_invalid');
    },
  );
  it('rejects forged size, signature, MIME, request identity and null display name', () => {
    const source = file();
    for (const input of [
      { file: { ...source, size: 99 }, requestId },
      { file: { ...source, buffer: Buffer.alloc(48) }, requestId },
      { file: { ...source, mimetype: 'image/png' }, requestId },
      { file: source, requestId: requestId.toUpperCase() },
    ])
      expect(() => validateBrandFontUpload(input)).toThrow(
        'font_asset_invalid',
      );
  });
  it('extracts basename, removes controls and rejects extension loss on truncation', () => {
    expect(
      normalizeBrandFontFileName(
        `C:\\folder\\Ac${String.fromCharCode(1)}me.woff2`,
      ),
    ).toBe('Acme.woff2');
    expect(() =>
      normalizeBrandFontFileName(`${'x'.repeat(256)}.woff2`),
    ).toThrow('font_asset_invalid');
    expect(() => normalizeBrandFontFileName('Acme.ttf')).toThrow(
      'font_asset_invalid',
    );
  });
  it('keeps 256 codepoint astral filename bytes unchanged and rejects lost extension', () => {
    const original = `${'😀'.repeat(250)}.woff2`;
    expect(
      validateBrandFontUpload({
        requestId,
        file: { ...file(), originalname: original },
      }).originalFileName,
    ).toBe(original);
    expect(() =>
      normalizeBrandFontFileName(`${'😀'.repeat(251)}.woff2`),
    ).toThrow('font_asset_invalid');
    expect(
      validateBrandFontUpload({
        requestId,
        file: file(),
        displayName: '😀'.repeat(128),
      }).displayName,
    ).toBe('😀'.repeat(128));
    expect(() =>
      validateBrandFontUpload({
        requestId,
        file: file(),
        displayName: '😀'.repeat(129),
      }),
    ).toThrow('font_asset_invalid');
  });
  it('pins the deterministic id to exact scope and request identity', () => {
    const expected =
      'c' +
      createHash('sha256')
        .update(
          JSON.stringify(['brand-font-upload-v1', 'org', 'brand', requestId]),
        )
        .digest('hex')
        .slice(0, 24);
    expect(computeBrandFontUploadId('org', 'brand', requestId)).toBe(expected);
    expect(computeBrandFontUploadId('other', 'brand', requestId)).not.toBe(
      expected,
    );
  });
  it('roundtrips the canonical sorted-key UTF8 cursor only', () => {
    const cursor = { createdAt: '2026-10-01T00:00:00.000Z', id: '界' };
    expect(parseBrandFontCursor(encodeBrandFontCursor(cursor))).toEqual(cursor);
  });
  it.each([
    ''.padEnd(2113, 'a'),
    Buffer.from('{"id":"a","createdAt":"2026-10-01T00:00:00.000Z"}').toString(
      'base64url',
    ),
    Buffer.from('{"createdAt":"2026-10-01T00:00:00Z","id":"a"}').toString(
      'base64url',
    ),
    Buffer.from([255]).toString('base64url'),
    Buffer.from(
      JSON.stringify({
        createdAt: '2026-10-01T00:00:00.000Z',
        id: 'a',
        extra: true,
      }),
    ).toString('base64url'),
  ])('rejects noncanonical or bounded cursor %s', (value) => {
    expect(() => parseBrandFontCursor(value)).toThrow('font_asset_invalid');
  });
});

it('rejects high-bit magic lookalikes rather than masking them to ASCII', () => {
  const source = file();
  Buffer.from([0xf7, 0xcf, 0xc6, 0xb2]).copy(source.buffer);
  expect(() => validateBrandFontUpload({ requestId, file: source })).toThrow(
    'font_asset_invalid',
  );
});
