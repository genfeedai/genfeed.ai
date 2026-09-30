import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  calculateNodeSize,
  calculateNodeSizePreservingHeight,
  getImageDimensions,
  getVideoDimensions,
} from './nodeDimensions';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('getImageDimensions', () => {
  it('resolves null for non-image data URLs', async () => {
    await expect(getImageDimensions('https://cdn/x.png')).resolves.toBeNull();
    await expect(getImageDimensions('')).resolves.toBeNull();
  });

  it('resolves natural dimensions when the image loads', async () => {
    class StubImage {
      naturalHeight = 0;
      naturalWidth = 0;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;

      set src(_value: string) {
        queueMicrotask(() => {
          this.naturalWidth = 320;
          this.naturalHeight = 240;
          this.onload?.();
        });
      }
    }
    vi.stubGlobal('Image', StubImage);

    await expect(
      getImageDimensions('data:image/png;base64,abc'),
    ).resolves.toEqual({ height: 240, width: 320 });
  });

  it('resolves null when the image fails to load', async () => {
    class StubImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;

      set src(_value: string) {
        queueMicrotask(() => this.onerror?.());
      }
    }
    vi.stubGlobal('Image', StubImage);

    await expect(
      getImageDimensions('data:image/png;base64,broken'),
    ).resolves.toBeNull();
  });
});

describe('getVideoDimensions', () => {
  it('resolves null for empty urls', async () => {
    await expect(getVideoDimensions('')).resolves.toBeNull();
  });

  it('resolves dimensions when metadata loads', async () => {
    interface FakeVideo {
      onloadedmetadata: (() => void) | null;
      onerror: (() => void) | null;
      src: string;
      videoHeight: number;
      videoWidth: number;
    }

    const realCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation(
      (tagName: string) => {
        if (tagName !== 'video') return realCreateElement(tagName);
        const video: FakeVideo = {
          onerror: null,
          onloadedmetadata: null,
          src: '',
          videoHeight: 0,
          videoWidth: 0,
        };
        return new Proxy(video, {
          set(target, prop, value) {
            Reflect.set(target, prop, value);
            if (prop === 'src') {
              queueMicrotask(() => {
                target.videoWidth = 1280;
                target.videoHeight = 720;
                target.onloadedmetadata?.();
              });
            }
            return true;
          },
        }) as unknown as HTMLVideoElement;
      },
    );

    await expect(getVideoDimensions('blob:video')).resolves.toEqual({
      height: 720,
      width: 1280,
    });
  });
});

describe('calculateNodeSize', () => {
  it('falls back to a square for invalid aspect ratios', () => {
    expect(calculateNodeSize(0)).toEqual({ height: 300, width: 300 });
    expect(calculateNodeSize(-2)).toEqual({ height: 300, width: 300 });
    expect(calculateNodeSize(Number.NaN)).toEqual({ height: 300, width: 300 });
    expect(calculateNodeSize(Number.POSITIVE_INFINITY)).toEqual({
      height: 300,
      width: 300,
    });
  });

  it('computes height from width for a landscape ratio', () => {
    const size = calculateNodeSize(16 / 9, 300);
    expect(size.width).toBe(300);
    expect(size.height).toBe(Math.round(300 / (16 / 9) + 100));
  });

  it('clamps the base width into [200, 500]', () => {
    expect(calculateNodeSize(1, 100).width).toBeGreaterThanOrEqual(200);
    expect(calculateNodeSize(16 / 9, 900).width).toBeLessThanOrEqual(500);
  });

  it('caps total height at 600 for tall portrait ratios', () => {
    const size = calculateNodeSize(9 / 16, 500);
    expect(size.height).toBeLessThanOrEqual(600);
    expect(size.width).toBeGreaterThan(0);
  });

  it('enforces the minimum height for ultra-wide ratios', () => {
    const size = calculateNodeSize(10, 300);
    expect(size.height).toBeGreaterThanOrEqual(200);
    expect(size.width).toBeLessThanOrEqual(500);
  });

  it('keeps width above the minimum for extreme portrait ratios', () => {
    const size = calculateNodeSize(0.1, 300);
    expect(size.width).toBeGreaterThanOrEqual(200);
    expect(size.height).toBeLessThanOrEqual(600);
  });
});

describe('calculateNodeSizePreservingHeight', () => {
  it('falls back for invalid aspect ratios', () => {
    expect(calculateNodeSizePreservingHeight(0)).toEqual({
      height: 300,
      width: 300,
    });
    expect(calculateNodeSizePreservingHeight(0, 420)).toEqual({
      height: 420,
      width: 300,
    });
  });

  it('preserves an in-range current height', () => {
    const size = calculateNodeSizePreservingHeight(1, 400);
    expect(size.height).toBe(400);
    expect(size.width).toBe(300);
  });

  it('clamps the derived width', () => {
    const wide = calculateNodeSizePreservingHeight(10, 400);
    expect(wide.width).toBe(500);

    const narrow = calculateNodeSizePreservingHeight(0.2, 400);
    expect(narrow.width).toBe(200);
  });

  it('recomputes from scratch when the height is out of range', () => {
    const size = calculateNodeSizePreservingHeight(16 / 9, 900);
    expect(size).toEqual(calculateNodeSize(16 / 9));
  });

  it('recomputes when no height is provided', () => {
    expect(calculateNodeSizePreservingHeight(16 / 9)).toEqual(
      calculateNodeSize(16 / 9),
    );
  });
});
