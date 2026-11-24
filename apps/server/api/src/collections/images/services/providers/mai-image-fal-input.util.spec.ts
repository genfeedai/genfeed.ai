import {
  buildMaiImageFalInput,
  fitMaiImageSize,
  isMaiImageEndpoint,
} from '@api/collections/images/services/providers/mai-image-fal-input.util';

const pixels = (size: { height: number; width: number }) =>
  size.width * size.height;

describe('fitMaiImageSize', () => {
  it('keeps a square inside the limits', () => {
    expect(fitMaiImageSize({ height: 1024, width: 1024 })).toEqual({
      height: 1024,
      width: 1024,
    });
  });

  it.each([
    { height: 1024, width: 576 },
    { height: 576, width: 1024 },
    { height: 512, width: 512 },
    { height: 640, width: 1920 },
  ])(
    'lifts $width x $height to a side of at least 768, a multiple of 16',
    (size) => {
      const fitted = fitMaiImageSize(size);
      expect(Math.min(fitted.width, fitted.height)).toBeGreaterThanOrEqual(768);
      expect(fitted.width % 16).toBe(0);
      expect(fitted.height % 16).toBe(0);
    },
  );

  it('keeps a lifted 9:16 or 16:9 request under the 1.05 MP billing floor', () => {
    expect(fitMaiImageSize({ height: 1024, width: 576 })).toEqual({
      height: 1360,
      width: 768,
    });
    expect(pixels(fitMaiImageSize({ height: 576, width: 1024 }))).toBeLessThan(
      1_050_000,
    );
  });

  it('scales an oversized request down to fal pixel limit', () => {
    const fitted = fitMaiImageSize({ height: 2160, width: 3840 });
    expect(pixels(fitted)).toBeLessThanOrEqual(4_194_304);
    expect(fitted.width / fitted.height).toBeCloseTo(16 / 9, 1);
  });
});

describe('buildMaiImageFalInput', () => {
  it('ignores endpoints that are not MAI-Image', () => {
    expect(isMaiImageEndpoint('fal-ai/flux/dev')).toBe(false);
    expect(
      buildMaiImageFalInput('fal-ai/flux/dev', {
        height: 1024,
        prompt: 'a cat',
        referenceImageUrls: [],
        width: 1024,
      }),
    ).toBeUndefined();
  });

  it.each([
    'microsoft/mai-image-2.7/text-to-image',
    'microsoft/mai-image-2.7/flash/text-to-image',
  ])('sends a prompt and a fitted size to %s', (endpoint) => {
    expect(
      buildMaiImageFalInput(endpoint, {
        height: 1024,
        prompt: 'a ceramic teapot',
        referenceImageUrls: ['https://cdn.test/ignored.png'],
        width: 576,
      }),
    ).toEqual({
      image_size: { height: 1360, width: 768 },
      prompt: 'a ceramic teapot',
    });
  });

  it.each([
    'microsoft/mai-image-2.7/edit',
    'microsoft/mai-image-2.7/flash/edit',
  ])('sends the source images to %s, at most five', (endpoint) => {
    const urls = Array.from(
      { length: 7 },
      (_, index) => `https://cdn.test/source-${index}.png`,
    );
    expect(
      buildMaiImageFalInput(endpoint, {
        height: 1024,
        prompt: 'make the teapot blue',
        referenceImageUrls: urls,
        width: 1024,
      }),
    ).toEqual({
      image_size: { height: 1024, width: 1024 },
      image_urls: urls.slice(0, 5),
      prompt: 'make the teapot blue',
    });
  });

  it('refuses an edit without a source image', () => {
    expect(() =>
      buildMaiImageFalInput('microsoft/mai-image-2.7/edit', {
        height: 1024,
        prompt: 'make the teapot blue',
        referenceImageUrls: [],
        width: 1024,
      }),
    ).toThrow('needs at least one source image');
  });
});
