import { presignNamedProviderVideoSource } from '@api/services/media-urls/provider-video-source.util';
import { describe, expect, it, vi } from 'vitest';

function createFiles() {
  return {
    copyInS3: vi.fn().mockResolvedValue(undefined),
    getPresignedDownloadUrlForObjectKey: vi
      .fn()
      .mockResolvedValue('https://storage.test/named?sig=fresh'),
  };
}

describe('presignNamedProviderVideoSource', () => {
  it('copies a stored object key to an .mp4-named key and presigns that key', async () => {
    const files = createFiles();

    const url = await presignNamedProviderVideoSource(files, {
      id: 'video-1',
      objectKey: 'ingredients/videos/opaque',
      storageKey: 'video-1',
      storageType: 'videos',
    });

    expect(url).toBe('https://storage.test/named?sig=fresh');
    expect(files.copyInS3).toHaveBeenCalledWith(
      'ingredients/videos/opaque',
      'provider-inputs/videos/video-1.mp4',
    );
    expect(files.getPresignedDownloadUrlForObjectKey).toHaveBeenCalledWith(
      'provider-inputs/videos/video-1.mp4',
    );
  });

  it('copies by storage key and type when the asset has no object key', async () => {
    const files = createFiles();

    await presignNamedProviderVideoSource(files, {
      id: 'video-2',
      objectKey: null,
      storageKey: 'video-2',
      storageType: 'videos',
    });

    expect(files.copyInS3).toHaveBeenCalledWith(
      'video-2',
      'provider-inputs/videos/video-2.mp4',
      'videos',
    );
  });

  it('presigns nothing when the copy fails', async () => {
    const files = createFiles();
    files.copyInS3.mockRejectedValue(new Error('copy unavailable'));

    await expect(
      presignNamedProviderVideoSource(files, {
        id: 'video-3',
        storageKey: 'video-3',
        storageType: 'videos',
      }),
    ).rejects.toThrow('copy unavailable');
    expect(files.getPresignedDownloadUrlForObjectKey).not.toHaveBeenCalled();
  });
});
