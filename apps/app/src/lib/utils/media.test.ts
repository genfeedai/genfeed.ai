import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getImageDimensions, getVideoMetadata } from './media';

describe('getImageDimensions', () => {
  let mockImage: Record<string, unknown>;

  beforeEach(() => {
    mockImage = {};
    vi.stubGlobal(
      'Image',
      vi.fn().mockImplementation(function imageConstructor(this: unknown) {
        return mockImage;
      })
    );
  });

  it('resolves with correct dimensions on load', async () => {
    const promise = getImageDimensions('https://example.com/image.png');
    mockImage.width = 1920;
    mockImage.height = 1080;
    (mockImage.onload as () => void)();
    expect(await promise).toEqual({ height: 1080, width: 1920 });
  });

  it('resolves with {0,0} on error', async () => {
    const promise = getImageDimensions('https://example.com/bad.png');
    (mockImage.onerror as () => void)();
    expect(await promise).toEqual({ height: 0, width: 0 });
  });

  it('sets crossOrigin to anonymous', () => {
    getImageDimensions('https://example.com/image.png');
    expect(mockImage.crossOrigin).toBe('anonymous');
  });
});

describe('getVideoMetadata', () => {
  let mockVideo: Record<string, unknown>;
  const originalCreateElement = document.createElement.bind(document);

  beforeEach(() => {
    mockVideo = {};
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'video') return mockVideo as unknown as HTMLVideoElement;
      return originalCreateElement(tag);
    });
  });

  it('resolves with duration and dimensions on loadedmetadata', async () => {
    const promise = getVideoMetadata('https://example.com/video.mp4');
    mockVideo.duration = 30.5;
    mockVideo.videoWidth = 3840;
    mockVideo.videoHeight = 2160;
    (mockVideo.onloadedmetadata as () => void)();
    expect(await promise).toEqual({
      dimensions: { height: 2160, width: 3840 },
      duration: 30.5,
    });
  });

  it('resolves with zeros on error', async () => {
    const promise = getVideoMetadata('https://example.com/bad.mp4');
    (mockVideo.onerror as () => void)();
    expect(await promise).toEqual({
      dimensions: { height: 0, width: 0 },
      duration: 0,
    });
  });

  it('sets crossOrigin to anonymous', () => {
    getVideoMetadata('https://example.com/video.mp4');
    expect(mockVideo.crossOrigin).toBe('anonymous');
  });
});
