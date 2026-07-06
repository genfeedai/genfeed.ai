import { useDominantColor } from '@hooks/ui/use-dominant-color/use-dominant-color';
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type ImageBehavior = 'load' | 'error';

let nextImageBehavior: ImageBehavior = 'load';
let fixedPixels: number[] = [];
let getImageDataThrows = false;

class MockImage {
  crossOrigin = '';
  decoding = '';
  private listeners: Record<string, Array<() => void>> = {};
  private internalSrc = '';

  addEventListener(type: string, cb: () => void): void {
    const existing = this.listeners[type] ?? [];
    existing.push(cb);
    this.listeners[type] = existing;
  }

  removeEventListener(type: string, cb: () => void): void {
    this.listeners[type] = (this.listeners[type] ?? []).filter(
      (fn) => fn !== cb,
    );
  }

  set src(value: string) {
    this.internalSrc = value;
    queueMicrotask(() => {
      const type = nextImageBehavior === 'load' ? 'load' : 'error';
      for (const cb of this.listeners[type] ?? []) {
        cb();
      }
    });
  }

  get src(): string {
    return this.internalSrc;
  }
}

function makePixels(rgba: [number, number, number, number], count: number) {
  return Array.from({ length: count }, () => rgba).flat();
}

describe('useDominantColor', () => {
  beforeEach(() => {
    nextImageBehavior = 'load';
    getImageDataThrows = false;
    fixedPixels = makePixels([255, 0, 0, 255], 4);

    vi.stubGlobal('Image', MockImage);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      (() => ({
        drawImage: vi.fn(),
        getImageData: () => {
          if (getImageDataThrows) {
            throw new Error('tainted canvas');
          }
          return { data: new Uint8ClampedArray(fixedPixels) };
        },
      })) as unknown as typeof HTMLCanvasElement.prototype.getContext,
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns null when no url is provided', () => {
    const { result } = renderHook(() => useDominantColor(null));
    expect(result.current).toBeNull();
  });

  it('returns null for an empty string url', () => {
    const { result } = renderHook(() => useDominantColor(''));
    expect(result.current).toBeNull();
  });

  it('extracts the dominant colour from a loaded image', async () => {
    const { result } = renderHook(() =>
      useDominantColor('https://cdn.example.com/red.png'),
    );

    await waitFor(() => {
      expect(result.current).toEqual({
        b: 0,
        g: 0,
        r: 255,
        rgb: 'rgb(255 0 0)',
      });
    });
  });

  it('weights saturated pixels above a neutral field', async () => {
    // Half mid-grey, half saturated blue — the blue subject should dominate.
    fixedPixels = [
      ...makePixels([128, 128, 128, 255], 4),
      ...makePixels([0, 0, 255, 255], 4),
    ];

    const { result } = renderHook(() =>
      useDominantColor('https://cdn.example.com/blue.png'),
    );

    await waitFor(() => {
      expect(result.current).not.toBeNull();
    });
    const dominant = result.current;
    expect(dominant).not.toBeNull();
    if (dominant) {
      expect(dominant.b).toBeGreaterThan(dominant.r);
      expect(dominant.b).toBeGreaterThan(dominant.g);
    }
  });

  it('returns null when the image fails to load', async () => {
    nextImageBehavior = 'error';

    const { result } = renderHook(() =>
      useDominantColor('https://cdn.example.com/missing.png'),
    );

    // Give the microtask a chance to run; result stays null.
    await Promise.resolve();
    expect(result.current).toBeNull();
  });

  it('returns null when the canvas is tainted (cross-origin without CORS)', async () => {
    getImageDataThrows = true;

    const { result } = renderHook(() =>
      useDominantColor('https://cdn.example.com/tainted.png'),
    );

    await Promise.resolve();
    expect(result.current).toBeNull();
  });

  it('clears the colour when the url is removed', async () => {
    const { result, rerender } = renderHook(
      ({ url }: { url: string | null }) => useDominantColor(url),
      { initialProps: { url: 'https://cdn.example.com/red.png' } },
    );

    await waitFor(() => {
      expect(result.current).not.toBeNull();
    });

    rerender({ url: null });
    expect(result.current).toBeNull();
  });
});
