import { describe, expect, it } from 'vitest';
import { compareBrandRgbaRegion } from './index';

const invalidMessage = 'brand_validation_invalid_rgba_region';
function expectInvalid(operation: () => boolean): void {
  expect(operation).toThrowError(RangeError);
  expect(operation).toThrowError(new RangeError(invalidMessage));
}

const frame = new Uint8Array([
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22,
  23, 24,
]);
const middleColumn = new Uint8Array([5, 6, 7, 8, 17, 18, 19, 20]);

describe('compareBrandRgbaRegion exact selected bytes', () => {
  it('matches an equal 1 by 1 region', () => {
    const pixels = new Uint8Array([18, 52, 86, 255]);
    expect(
      compareBrandRgbaRegion(pixels, 1, 1, 0, 0, 1, 1, pixels.slice()),
    ).toBe(true);
  });

  it('matches an entire frame', () => {
    expect(compareBrandRgbaRegion(frame, 3, 2, 0, 0, 3, 2, frame.slice())).toBe(
      true,
    );
  });

  it('uses source row stride for a 1 by 2 crop at x 1', () => {
    expect(compareBrandRgbaRegion(frame, 3, 2, 1, 0, 1, 2, middleColumn)).toBe(
      true,
    );
    expect(
      compareBrandRgbaRegion(frame, 3, 2, 1, 0, 1, 2, frame.slice(4, 12)),
    ).toBe(false);
  });

  it('matches the inclusive bottom-right boundary', () => {
    expect(
      compareBrandRgbaRegion(
        frame,
        3,
        2,
        2,
        1,
        1,
        1,
        new Uint8Array([21, 22, 23, 24]),
      ),
    ).toBe(true);
  });

  it('uses visible subview bytes with nonzero byte offsets', () => {
    const sourceBacking = new Uint8Array(30).fill(251);
    sourceBacking.set(frame, 3);
    const expectedBacking = new Uint8Array(12).fill(252);
    expectedBacking.set(middleColumn, 2);
    const pixels = sourceBacking.subarray(3, 27);
    const expected = expectedBacking.subarray(2, 10);
    expect(pixels.byteOffset).toBe(3);
    expect(expected.byteOffset).toBe(2);
    expect(compareBrandRgbaRegion(pixels, 3, 2, 1, 0, 1, 2, expected)).toBe(
      true,
    );
  });

  it('accepts Node Buffer as a Uint8Array subtype', () => {
    expect(
      compareBrandRgbaRegion(
        Buffer.from(frame),
        3,
        2,
        1,
        0,
        1,
        2,
        Buffer.from(middleColumn),
      ),
    ).toBe(true);
  });

  it.each([
    ['red', 0],
    ['green', 1],
    ['blue', 2],
    ['alpha', 3],
  ])('rejects a changed %s byte', (_channel, index) => {
    const expected = new Uint8Array([18, 52, 86, 255]);
    const pixels = expected.slice();
    pixels[index] ^= 1;
    expect(compareBrandRgbaRegion(pixels, 1, 1, 0, 0, 1, 1, expected)).toBe(
      false,
    );
  });

  it('compares transparent RGB without normalization', () => {
    expect(
      compareBrandRgbaRegion(
        new Uint8Array([19, 52, 86, 0]),
        1,
        1,
        0,
        0,
        1,
        1,
        new Uint8Array([18, 52, 86, 0]),
      ),
    ).toBe(false);
  });

  it('ignores pixel changes outside the selected crop', () => {
    const pixels = frame.slice();
    pixels[0] ^= 1;
    pixels[23] ^= 1;
    expect(compareBrandRgbaRegion(pixels, 3, 2, 1, 0, 1, 2, middleColumn)).toBe(
      true,
    );
  });

  it.each([true, false])(
    'preserves both inputs after returning %s',
    (matching) => {
      const pixels = frame.slice();
      const expected = middleColumn.slice();
      if (!matching) expected[4] ^= 1;
      const beforePixels = pixels.slice();
      const beforeExpected = expected.slice();
      expect(compareBrandRgbaRegion(pixels, 3, 2, 1, 0, 1, 2, expected)).toBe(
        matching,
      );
      expect(pixels).toEqual(beforePixels);
      expect(expected).toEqual(beforeExpected);
    },
  );

  it('accepts 1920 by 1080 with a bottom-right crop', () => {
    const pixels = new Uint8Array(1920 * 1080 * 4);
    pixels.set([18, 52, 86, 255], pixels.length - 4);
    expect(
      compareBrandRgbaRegion(
        pixels,
        1920,
        1080,
        1919,
        1079,
        1,
        1,
        new Uint8Array([18, 52, 86, 255]),
      ),
    ).toBe(true);
  });
});

describe('compareBrandRgbaRegion malformed inputs', () => {
  const invalidDimensions = [
    0,
    -1,
    0.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.MAX_SAFE_INTEGER + 1,
  ];
  for (const parameter of ['width', 'height', 'regionWidth', 'regionHeight']) {
    it.each(invalidDimensions)(`rejects invalid ${parameter} %s`, (value) => {
      expectInvalid(() =>
        compareBrandRgbaRegion(
          frame,
          parameter === 'width' ? value : 3,
          parameter === 'height' ? value : 2,
          1,
          0,
          parameter === 'regionWidth' ? value : 1,
          parameter === 'regionHeight' ? value : 2,
          middleColumn,
        ),
      );
    });
  }

  for (const parameter of ['x', 'y']) {
    it.each([
      -1,
      0.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.MAX_SAFE_INTEGER + 1,
    ])(`rejects invalid ${parameter} %s`, (value) => {
      expectInvalid(() =>
        compareBrandRgbaRegion(
          frame,
          3,
          2,
          parameter === 'x' ? value : 1,
          parameter === 'y' ? value : 0,
          1,
          2,
          middleColumn,
        ),
      );
    });
  }

  it.each([
    ['width limit', 1921, 1, 0, 0, 1, 1],
    ['height limit', 1, 1081, 0, 0, 1, 1],
    ['region wider than frame', 3, 2, 0, 0, 4, 1],
    ['region taller than frame', 3, 2, 0, 0, 1, 3],
    ['origin at frame width', 3, 2, 3, 0, 1, 1],
    ['origin at frame height', 3, 2, 0, 2, 1, 1],
    ['crop over right edge', 3, 2, 2, 0, 2, 1],
    ['crop over bottom edge', 3, 2, 0, 1, 1, 2],
    [
      'safe but overflowing region width',
      3,
      2,
      0,
      0,
      Number.MAX_SAFE_INTEGER,
      1,
    ],
    [
      'safe but overflowing region height',
      3,
      2,
      0,
      0,
      1,
      Number.MAX_SAFE_INTEGER,
    ],
  ])('rejects %s', (_label, width, height, x, y, regionWidth, regionHeight) => {
    expectInvalid(() =>
      compareBrandRgbaRegion(
        frame,
        width,
        height,
        x,
        y,
        regionWidth,
        regionHeight,
        middleColumn,
      ),
    );
  });

  it.each([0, 23, 25])('rejects source byte length %s', (length) => {
    expectInvalid(() =>
      compareBrandRgbaRegion(
        new Uint8Array(length),
        3,
        2,
        1,
        0,
        1,
        2,
        middleColumn,
      ),
    );
  });

  it.each([0, 7, 9])('rejects expected byte length %s', (length) => {
    expectInvalid(() =>
      compareBrandRgbaRegion(frame, 3, 2, 1, 0, 1, 2, new Uint8Array(length)),
    );
  });

  it('rejects non-Uint8Array source input', () => {
    expectInvalid(() =>
      // @ts-expect-error Intentional malformed runtime byte input.
      compareBrandRgbaRegion([1, 2, 3, 4], 1, 1, 0, 0, 1, 1, new Uint8Array(4)),
    );
  });

  it('rejects non-Uint8Array expected input', () => {
    expectInvalid(() =>
      // @ts-expect-error Intentional malformed runtime byte input.
      compareBrandRgbaRegion(
        new Uint8Array(4),
        1,
        1,
        0,
        0,
        1,
        1,
        new Uint8ClampedArray(4),
      ),
    );
  });
});
