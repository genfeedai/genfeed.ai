import { describe, expect, it } from 'vitest';
import {
  isBannerRatio,
  resolveBannerOutputSize,
  resolveCenterCropRect,
} from './banner-crop.util';

describe('banner crop', () => {
  it.each([
    // [image width, image height, expected crop]
    [3000, 2000, { height: 1000, width: 3000, x: 0, y: 500 }],
    [1000, 1000, { height: 333, width: 1000, x: 0, y: 334 }],
    [4500, 1000, { height: 1000, width: 3000, x: 750, y: 0 }],
    [1500, 500, { height: 500, width: 1500, x: 0, y: 0 }],
  ])(
    'crops a %ix%i image to the largest centered 3:1 frame',
    (width, height, expected) => {
      expect(resolveCenterCropRect(width, height)).toEqual(expected);
    },
  );

  it.each([
    [
      { height: 1000, width: 3000, x: 0, y: 0 },
      { height: 500, width: 1500 },
    ],
    [
      { height: 100, width: 300, x: 0, y: 0 },
      { height: 100, width: 300 },
    ],
  ])('scales a crop down to 1500x500 and never up (%o)', (crop, expected) => {
    expect(resolveBannerOutputSize(crop)).toEqual(expected);
  });

  it.each([
    [1500, 500, true],
    [1501, 500, true],
    [1920, 1080, false],
    [1000, 1000, false],
  ])('recognises a %ix%i image as 3:1: %s', (width, height, expected) => {
    expect(isBannerRatio(width, height)).toBe(expected);
  });

  it.each([
    // [image width, image height, slot size, expected crop]
    [
      1920,
      1080,
      { height: 400, width: 400 },
      { height: 1080, width: 1080, x: 420, y: 0 },
    ],
    [
      3000,
      3000,
      { height: 1440, width: 2560 },
      { height: 1688, width: 3000, x: 0, y: 656 },
    ],
  ])(
    'crops a %ix%i image to the %o platform slot ratio',
    (width, height, target, expected) => {
      expect(
        resolveCenterCropRect(width, height, target.width / target.height),
      ).toEqual(expected);
    },
  );

  it('scales a platform crop down to the slot size', () => {
    expect(
      resolveBannerOutputSize(
        { height: 1080, width: 1080, x: 420, y: 0 },
        { height: 400, width: 400 },
      ),
    ).toEqual({ height: 400, width: 400 });
  });
});
