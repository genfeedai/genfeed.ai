import { afterEach, describe, expect, it, vi } from 'vitest';
import { getImageDimensions, getVideoMetadata } from './media';

interface FakeImage {
  crossOrigin: string | null;
  height: number;
  width: number;
  onload: (() => void) | null;
  onerror: (() => void) | null;
  src: string;
}

function stubImage(behavior: 'load' | 'error', width = 0, height = 0): void {
  class StubImage implements FakeImage {
    crossOrigin: string | null = null;
    height = 0;
    width = 0;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;

    #src = '';

    get src(): string {
      return this.#src;
    }

    set src(value: string) {
      this.#src = value;
      queueMicrotask(() => {
        if (behavior === 'load') {
          this.width = width;
          this.height = height;
          this.onload?.();
        } else {
          this.onerror?.();
        }
      });
    }
  }

  vi.stubGlobal('Image', StubImage);
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('getImageDimensions', () => {
  it('resolves the natural dimensions on load', async () => {
    stubImage('load', 640, 480);
    await expect(
      getImageDimensions('https://cdn.example.com/a.png'),
    ).resolves.toEqual({
      height: 480,
      width: 640,
    });
  });

  it('resolves zero dimensions on error', async () => {
    stubImage('error');
    await expect(getImageDimensions('bad-url')).resolves.toEqual({
      height: 0,
      width: 0,
    });
  });
});

describe('getVideoMetadata', () => {
  interface FakeVideo {
    crossOrigin: string | null;
    duration: number;
    videoHeight: number;
    videoWidth: number;
    onloadedmetadata: (() => void) | null;
    onerror: (() => void) | null;
    src: string;
  }

  function stubVideo(behavior: 'load' | 'error'): void {
    const realCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation(
      (tagName: string) => {
        if (tagName !== 'video') {
          return realCreateElement(tagName);
        }

        const video: FakeVideo = {
          crossOrigin: null,
          duration: 0,
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
                if (behavior === 'load') {
                  target.duration = 12.5;
                  target.videoWidth = 1920;
                  target.videoHeight = 1080;
                  target.onloadedmetadata?.();
                } else {
                  target.onerror?.();
                }
              });
            }
            return true;
          },
        }) as unknown as HTMLVideoElement;
      },
    );
  }

  it('resolves duration and dimensions on metadata load', async () => {
    stubVideo('load');
    await expect(
      getVideoMetadata('https://cdn.example.com/v.mp4'),
    ).resolves.toEqual({
      dimensions: { height: 1080, width: 1920 },
      duration: 12.5,
    });
  });

  it('resolves zeros on error', async () => {
    stubVideo('error');
    await expect(getVideoMetadata('bad-url')).resolves.toEqual({
      dimensions: { height: 0, width: 0 },
      duration: 0,
    });
  });
});
