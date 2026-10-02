import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { crc32, deflateSync } from 'node:zlib';
import {
  decodeBrandPngBytes,
  decodeBrandTextBytes,
  hashBrandArtifactBytes,
} from '@api/services/brand-validation/brand-validation-artifact.util';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const fixture = (file: string) =>
  readFile(new URL(`./fixtures/${file}`, import.meta.url));
const independentHash = (bytes: Uint8Array) =>
  `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
function chunk(type: string, payload = Buffer.alloc(0)): Buffer {
  const bytes = Buffer.alloc(payload.length + 12);
  bytes.writeUInt32BE(payload.length, 0);
  bytes.write(type, 4, 4, 'ascii');
  payload.copy(bytes, 8);
  bytes.writeUInt32BE(
    crc32(bytes.subarray(4, bytes.length - 4)),
    bytes.length - 4,
  );
  return bytes;
}
function header(
  width = 1,
  height = 1,
  depth = 8,
  colorType = 6,
  interlace = 0,
  compression = 0,
  filter = 0,
): Buffer {
  const bytes = Buffer.alloc(13);
  bytes.writeUInt32BE(width, 0);
  bytes.writeUInt32BE(height, 4);
  bytes.set([depth, colorType, compression, filter, interlace], 8);
  return chunk('IHDR', bytes);
}
const dataChunk = () =>
  chunk('IDAT', deflateSync(Buffer.from([0, 11, 22, 33, 255])));
const endChunk = () => chunk('IEND');
const png = (...chunks: Buffer[]) => Buffer.concat([signature, ...chunks]);
const tinyPng = () => png(header(), dataChunk(), endChunk());
async function expectPngFailure(
  bytes: Uint8Array,
  errorType: typeof Error,
  message: string,
): Promise<void> {
  let failure: unknown;
  try {
    await decodeBrandPngBytes(bytes);
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(errorType);
  expect(failure instanceof Error && failure.constructor).toBe(errorType);
  expect(failure instanceof Error && failure.message).toBe(message);
}
function expectedFixture(file: string): Buffer {
  const size = file === 'logo.png' || file === 'product.png' ? 32 : 256;
  const data = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      let value = [18, 52, 86, 255];
      const isLogo =
        file === 'logo.png' ||
        (size === 256 && x >= 16 && x < 48 && y >= 16 && y < 48);
      const isProduct =
        file === 'product.png' ||
        (size === 256 && x >= 16 && x < 48 && y >= 64 && y < 96);
      if (isLogo) {
        const localX = file === 'logo.png' ? x : x - 16;
        const localY = file === 'logo.png' ? y : y - 16;
        value =
          localX < 4 || localX >= 28 || localY < 4 || localY >= 28
            ? [0, 0, 0, 255]
            : localX < 16
              ? [37, 99, 235, 255]
              : [255, 255, 255, 255];
      } else if (isProduct) {
        const localX = file === 'product.png' ? x : x - 16;
        const localY = file === 'product.png' ? y : y - 64;
        value =
          localX >= 8 && localX <= 23 && localY >= 8 && localY <= 23
            ? [245, 158, 11, 255]
            : [16, 185, 129, 255];
      }
      if (file === 'wrong-palette.png' && x === 200 && y === 200)
        value = [19, 52, 86, 255];
      if (file === 'wrong-logo.png' && x === 20 && y === 20)
        value = [38, 99, 235, 255];
      data.set(value, (y * size + x) * 4);
    }
  return data;
}

describe('actual brand artifact byte hashes', () => {
  it('hashes abc against its independently fixed SHA256', () => {
    expect(hashBrandArtifactBytes(Buffer.from('abc'))).toBe(
      'sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
  it('matches every immutable corpus hash', async () => {
    const manifest = JSON.parse(
      (await fixture('manifest.json')).toString('utf8'),
    );
    expect(manifest.artifacts).toHaveLength(7);
    for (const entry of manifest.artifacts) {
      const bytes = await fixture(entry.file);
      expect(hashBrandArtifactBytes(bytes)).toBe(entry.sha256);
      expect(bytes.byteLength).toBe(entry.byteLength);
    }
  });
  it('hashes visible subviews without mutating input and detects a changed byte', () => {
    const backing = Buffer.from([0, 97, 98, 99, 0]);
    const before = Buffer.from(backing);
    expect(hashBrandArtifactBytes(backing.subarray(1, 4))).toBe(
      hashBrandArtifactBytes(Buffer.from('abc')),
    );
    expect(backing).toEqual(before);
    backing[2] = 100;
    expect(hashBrandArtifactBytes(backing.subarray(1, 4))).not.toBe(
      hashBrandArtifactBytes(Buffer.from('abc')),
    );
  });
  it('accepts exactly 20 MiB and rejects its overflow for every operation', async () => {
    const maximum = Buffer.alloc(20_971_520);
    expect(hashBrandArtifactBytes(maximum)).toBe(independentHash(maximum));
    const overflow = Buffer.alloc(20_971_521);
    expect(() => hashBrandArtifactBytes(overflow)).toThrowError(
      new RangeError('brand_validation_artifact_size_limit'),
    );
    expect(() => decodeBrandTextBytes(overflow)).toThrowError(
      new RangeError('brand_validation_artifact_size_limit'),
    );
    await expectPngFailure(
      overflow,
      RangeError,
      'brand_validation_artifact_size_limit',
    );
  });
  it('rejects empty bytes for every operation', async () => {
    expect(() => hashBrandArtifactBytes(new Uint8Array())).toThrowError(
      new TypeError('brand_validation_invalid_bytes'),
    );
    expect(() => decodeBrandTextBytes(new Uint8Array())).toThrowError(
      new TypeError('brand_validation_invalid_bytes'),
    );
    await expectPngFailure(
      new Uint8Array(),
      TypeError,
      'brand_validation_invalid_bytes',
    );
  });
  it('rejects wrong runtime byte types', async () => {
    // @ts-expect-error Intentional runtime type rejection.
    expect(() => hashBrandArtifactBytes('abc')).toThrowError(
      new TypeError('brand_validation_invalid_bytes'),
    );
    // @ts-expect-error Intentional runtime type rejection.
    expect(() => decodeBrandTextBytes([97])).toThrowError(
      new TypeError('brand_validation_invalid_bytes'),
    );
    await expectPngFailure(
      // @ts-expect-error Intentional runtime type rejection.
      new Uint8ClampedArray([137]),
      TypeError,
      'brand_validation_invalid_bytes',
    );
  });
});

describe('strict original UTF-8 text', () => {
  it('preserves actual Unicode and CRLF corpus strings', async () => {
    const corpus = JSON.parse(
      (await fixture('approved-text.json')).toString('utf8'),
    );
    const text: string = corpus.cases[7].text;
    const source: string = corpus.cases[7].sourceText;
    const bytes = Buffer.from(text);
    const before = Buffer.from(bytes);
    expect(decodeBrandTextBytes(bytes)).toBe('Example Co\r\nCafe\u0301.');
    expect(decodeBrandTextBytes(Buffer.from(source))).toBe(
      'Example Co\nCaf\u00e9.',
    );
    expect(hashBrandArtifactBytes(bytes)).not.toBe(
      hashBrandArtifactBytes(Buffer.from(source)),
    );
    expect(text.replaceAll('\r\n', '\n').normalize('NFC')).toBe(
      source.normalize('NFC'),
    );
    expect(bytes).toEqual(before);
  });
  it('preserves BOM, NUL, astral characters, combining marks and whitespace in a subview', () => {
    const text = '\ufeff \0\r\nCafe\u0301 😀\t';
    const encoded = Buffer.from(text);
    const backing = Buffer.concat([
      Buffer.from([255]),
      encoded,
      Buffer.from([255]),
    ]);
    expect(decodeBrandTextBytes(backing.subarray(1, 1 + encoded.length))).toBe(
      text,
    );
  });
  it('counts UTF-16 units at the text boundary', () => {
    expect(decodeBrandTextBytes(Buffer.from('😀'.repeat(50_000))).length).toBe(
      100_000,
    );
    expect(() =>
      decodeBrandTextBytes(Buffer.from(`${'😀'.repeat(50_000)}a`)),
    ).toThrowError(new RangeError('brand_validation_text_size_limit'));
  });
  it.each([
    ['invalid leading', [255]],
    ['truncated', [226, 130]],
    ['overlong', [192, 175]],
    ['surrogate', [237, 160, 128]],
  ] as const)('rejects %s UTF-8', (_label, bytes) => {
    expect(() => decodeBrandTextBytes(Buffer.from(bytes))).toThrowError(
      new TypeError('brand_validation_invalid_utf8'),
    );
  });
});

describe('original PNG pixels from the immutable corpus', () => {
  it.each([
    'approved.png',
    'logo.png',
    'product.png',
    'wrong-logo.png',
    'wrong-palette.png',
  ])('decodes exact fixture-defined bytes for %s', async (file) => {
    const bytes = await fixture(file);
    const before = Buffer.from(bytes);
    const result = await decodeBrandPngBytes(bytes);
    const size = file === 'logo.png' || file === 'product.png' ? 32 : 256;
    expect(result.info.width).toBe(size);
    expect(result.info.height).toBe(size);
    expect(result.info.channels).toBe(4);
    expect(result.info.premultiplied).toBe(false);
    expect(result.data).toEqual(expectedFixture(file));
    expect(bytes).toEqual(before);
  });
  it.each([
    ['wrong-palette.png', 200, 200, 18, 19],
    ['wrong-logo.png', 20, 20, 37, 38],
  ] as const)(
    'finds only the specified red-byte mutation in %s',
    async (file, x, y, original, changed) => {
      const approved = (
        await decodeBrandPngBytes(await fixture('approved.png'))
      ).data;
      const negative = (await decodeBrandPngBytes(await fixture(file))).data;
      const differences = [];
      for (let index = 0; index < approved.length; index++)
        if (approved[index] !== negative[index]) differences.push(index);
      const index = (y * 256 + x) * 4;
      expect(differences).toEqual([index]);
      expect(approved[index]).toBe(original);
      expect(negative[index]).toBe(changed);
    },
  );
  it('hashes MP4 as bytes and explicitly rejects it as PNG', async () => {
    const bytes = await fixture('sample.mp4');
    expect(hashBrandArtifactBytes(bytes)).toBe(independentHash(bytes));
    await expectPngFailure(
      bytes,
      Error,
      'brand_validation_png_format_unsupported',
    );
  });
});

describe('real library decoding and snapshot purity', () => {
  it('fills alpha 255 for RGB', async () => {
    const original = Buffer.from([11, 22, 33, 44, 55, 66]);
    const bytes = await sharp(original, {
      raw: { width: 2, height: 1, channels: 3 },
    })
      .png()
      .toBuffer();
    const result = await decodeBrandPngBytes(bytes);
    expect(result.data).toEqual(
      Buffer.from([11, 22, 33, 255, 44, 55, 66, 255]),
    );
  });
  it('preserves hidden RGB and partial alpha', async () => {
    const original = Buffer.from([
      11, 22, 33, 0, 44, 55, 66, 128, 77, 88, 99, 255,
    ]);
    const bytes = await sharp(original, {
      raw: { width: 3, height: 1, channels: 4 },
    })
      .png()
      .toBuffer();
    expect((await decodeBrandPngBytes(bytes)).data).toEqual(original);
  });
  it('captures visible Buffer subview before awaiting without aliasing caller bytes', async () => {
    const original = tinyPng();
    const backing = Buffer.concat([
      Buffer.from([255]),
      original,
      Buffer.from([255]),
    ]);
    const view = backing.subarray(1, backing.length - 1);
    const preserved = Buffer.from(view);
    const resultPromise = decodeBrandPngBytes(view);
    view.fill(0);
    const result = await resultPromise;
    expect(result.data).toEqual(Buffer.from([11, 22, 33, 255]));
    expect(result.info.width).toBe(1);
    expect(result.info.height).toBe(1);
    expect(hashBrandArtifactBytes(preserved)).toBe(independentHash(original));
    result.data[0] = 99;
    expect(view.every((byte) => byte === 0)).toBe(true);
    expect(backing[0]).toBe(255);
    expect(backing[backing.length - 1]).toBe(255);
  });
  it('accepts a compact maximum-size image', async () => {
    const bytes = await sharp({
      create: {
        width: 1920,
        height: 1080,
        channels: 4,
        background: { r: 18, g: 52, b: 86, alpha: 1 },
      },
    })
      .png()
      .toBuffer();
    const result = await decodeBrandPngBytes(bytes);
    expect(result.info.width).toBe(1920);
    expect(result.info.height).toBe(1080);
    expect(result.data.length).toBe(1920 * 1080 * 4);
    const expected = Buffer.alloc(1920 * 1080 * 4).fill(
      Buffer.from([18, 52, 86, 255]),
    );
    expect(result.data.equals(expected)).toBe(true);
  });
});

describe('checked PNG framing and encoding boundaries', () => {
  it.each([
    Buffer.from([255, 216, 255]),
    Buffer.from('RIFF0000WEBP'),
    Buffer.from('<svg/>'),
  ])('rejects non-PNG signature', async (bytes) => {
    await expectPngFailure(
      bytes,
      Error,
      'brand_validation_png_format_unsupported',
    );
  });
  it.each([
    'acTL',
    'fcTL',
    'fdAT',
    'eXIf',
    'iCCP',
    'gAMA',
    'cHRM',
    'cICP',
    'tRNS',
    'PLTE',
    'tEXt',
    'iTXt',
    'zTXt',
    'aaAA',
  ])('rejects %s metadata rather than interpreting it', async (type) => {
    await expectPngFailure(
      png(header(), chunk(type, Buffer.from([0])), dataChunk(), endChunk()),
      Error,
      'brand_validation_png_metadata_unsupported',
    );
  });
  it.each([
    [16, 6, 0],
    [8, 0, 0],
    [8, 3, 0],
    [8, 4, 0],
    [8, 6, 1],
  ])(
    'rejects unsupported depth %s/color %s/interlace %s',
    async (depth, colorType, interlace) => {
      await expectPngFailure(
        png(header(1, 1, depth, colorType, interlace), dataChunk(), endChunk()),
        Error,
        'brand_validation_png_encoding_unsupported',
      );
    },
  );
  it.each([
    [1921, 1],
    [1, 1081],
  ])('rejects image dimensions %s by %s', async (width, height) => {
    await expectPngFailure(
      png(header(width, height), dataChunk(), endChunk()),
      RangeError,
      'brand_validation_image_size_limit',
    );
  });
  it.each([
    [0, 1, 0, 0, 0],
    [1, 0, 0, 0, 0],
    [1, 1, 2, 0, 0],
    [1, 1, 0, 1, 0],
    [1, 1, 0, 0, 1],
  ])(
    'rejects malformed IHDR parameters',
    async (width, height, interlace, compression, filter) => {
      await expectPngFailure(
        png(
          header(width, height, 8, 6, interlace, compression, filter),
          dataChunk(),
          endChunk(),
        ),
        TypeError,
        'brand_validation_invalid_png',
      );
    },
  );
  it('verifies every stored CRC', async () => {
    const bytes = tinyPng();
    bytes[29] ^= 1;
    await expectPngFailure(bytes, TypeError, 'brand_validation_invalid_png');
  });
  it('rejects truncated and unsigned-overflow framing', async () => {
    await expectPngFailure(
      tinyPng().subarray(0, 20),
      TypeError,
      'brand_validation_invalid_png',
    );
    const bytes = tinyPng();
    bytes.writeUInt32BE(0xffffffff, 8);
    await expectPngFailure(bytes, TypeError, 'brand_validation_invalid_png');
  });
  it.each(['aa1A', 'aaaa'])(
    'rejects invalid chunk-type letters/reserved bit %s',
    async (type) => {
      await expectPngFailure(
        png(header(), chunk(type), dataChunk(), endChunk()),
        TypeError,
        'brand_validation_invalid_png',
      );
    },
  );
  it.each([
    ['absent IHDR', () => png(dataChunk(), endChunk())],
    [
      'late IHDR',
      () =>
        png(chunk('sRGB', Buffer.from([0])), header(), dataChunk(), endChunk()),
    ],
    ['duplicate IHDR', () => png(header(), header(), dataChunk(), endChunk())],
    [
      'wrong IHDR length',
      () => png(chunk('IHDR', Buffer.alloc(12)), dataChunk(), endChunk()),
    ],
    ['absent IEND', () => png(header(), dataChunk())],
    [
      'duplicate IEND',
      () => png(header(), dataChunk(), endChunk(), endChunk()),
    ],
    ['trailing bytes', () => Buffer.concat([tinyPng(), Buffer.from([0])])],
    [
      'nonempty IEND',
      () => png(header(), dataChunk(), chunk('IEND', Buffer.from([0]))),
    ],
    ['absent IDAT', () => png(header(), endChunk())],
    ['empty IDAT run', () => png(header(), chunk('IDAT'), endChunk())],
    [
      'noncontiguous IDAT',
      () =>
        png(
          header(),
          dataChunk(),
          chunk('pHYs', Buffer.alloc(9)),
          dataChunk(),
          endChunk(),
        ),
    ],
    [
      'duplicate sRGB',
      () =>
        png(
          header(),
          chunk('sRGB', Buffer.from([0])),
          chunk('sRGB', Buffer.from([0])),
          dataChunk(),
          endChunk(),
        ),
    ],
    [
      'late sRGB',
      () =>
        png(header(), dataChunk(), chunk('sRGB', Buffer.from([0])), endChunk()),
    ],
    [
      'bad sRGB intent',
      () =>
        png(header(), chunk('sRGB', Buffer.from([4])), dataChunk(), endChunk()),
    ],
    [
      'bad sRGB length',
      () => png(header(), chunk('sRGB'), dataChunk(), endChunk()),
    ],
    [
      'duplicate pHYs',
      () =>
        png(
          header(),
          chunk('pHYs', Buffer.alloc(9)),
          chunk('pHYs', Buffer.alloc(9)),
          dataChunk(),
          endChunk(),
        ),
    ],
    [
      'late pHYs',
      () =>
        png(header(), dataChunk(), chunk('pHYs', Buffer.alloc(9)), endChunk()),
    ],
    [
      'bad pHYs length',
      () =>
        png(header(), chunk('pHYs', Buffer.alloc(8)), dataChunk(), endChunk()),
    ],
    [
      'bad pHYs unit',
      () =>
        png(
          header(),
          chunk('pHYs', Buffer.from([0, 0, 0, 0, 0, 0, 0, 0, 2])),
          dataChunk(),
          endChunk(),
        ),
    ],
    [
      'invalid compressed payload with valid CRC',
      () => png(header(), chunk('IDAT', Buffer.from([1, 2, 3])), endChunk()),
    ],
  ] as const)('rejects %s', async (_label, make) => {
    await expectPngFailure(make(), TypeError, 'brand_validation_invalid_png');
  });
  it('accepts allowed sRGB/pHYs and zero-length chunks in a nonempty contiguous IDAT run', async () => {
    const bytes = png(
      header(),
      chunk('sRGB', Buffer.from([3])),
      chunk('pHYs', Buffer.alloc(9)),
      chunk('IDAT'),
      dataChunk(),
      chunk('IDAT'),
      endChunk(),
    );
    expect((await decodeBrandPngBytes(bytes)).data).toEqual(
      Buffer.from([11, 22, 33, 255]),
    );
  });
  it('rejects more than 1024 chunks', async () => {
    const bytes = png(
      header(),
      dataChunk(),
      ...Array.from({ length: 1022 }, () => chunk('IDAT')),
      endChunk(),
    );
    await expectPngFailure(
      bytes,
      RangeError,
      'brand_validation_png_chunk_limit',
    );
  });
});
