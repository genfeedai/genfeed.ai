import { presignNamedProviderVideoSource } from '@api/services/media-urls/provider-video-source.util';
import { describe, expect, it } from 'vitest';

/** In-memory object store: a copy writes the destination key, a presign reads it. */
function createStore(
  keys: string[],
  options: { isCopyFailing?: boolean } = {},
) {
  const objects = new Set(keys);
  return {
    copyInS3: async (source: string, destination: string, type?: string) => {
      if (options.isCopyFailing) throw new Error('copy unavailable');
      if (!objects.has(type ? `${type}/${source}` : source)) {
        throw new Error(`missing source ${source}`);
      }
      objects.add(destination);
    },
    getPresignedDownloadUrlForObjectKey: async (key: string) => {
      if (!objects.has(key)) throw new Error(`missing object ${key}`);
      return `https://storage.test/${key}?sig=fresh`;
    },
  };
}

describe('presignNamedProviderVideoSource', () => {
  it('presigns an .mp4-named copy of a stored object key', async () => {
    const store = createStore(['ingredients/videos/opaque']);

    await expect(
      presignNamedProviderVideoSource(store, {
        id: 'video-1',
        objectKey: 'ingredients/videos/opaque',
        storageKey: 'video-1',
        storageType: 'videos',
      }),
    ).resolves.toBe(
      'https://storage.test/provider-inputs/videos/video-1.mp4?sig=fresh',
    );
  });

  it('presigns an .mp4-named copy found by storage key and type', async () => {
    const store = createStore(['videos/video-2']);

    await expect(
      presignNamedProviderVideoSource(store, {
        id: 'video-2',
        objectKey: null,
        storageKey: 'video-2',
        storageType: 'videos',
      }),
    ).resolves.toBe(
      'https://storage.test/provider-inputs/videos/video-2.mp4?sig=fresh',
    );
  });

  it('issues no URL when the copy fails', async () => {
    const store = createStore([], { isCopyFailing: true });

    await expect(
      presignNamedProviderVideoSource(store, {
        id: 'video-3',
        storageKey: 'video-3',
        storageType: 'videos',
      }),
    ).rejects.toThrow('copy unavailable');
  });
});
