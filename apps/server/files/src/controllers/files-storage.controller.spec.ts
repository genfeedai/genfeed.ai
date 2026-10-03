import { FilesStorageController } from '@files/controllers/files-storage.controller';

describe('FilesStorageController exact stored object signing', () => {
  it('preserves reserved characters in the JSON storage key', async () => {
    const getPresignedDownloadUrlForStoredKey = vi
      .fn()
      .mockResolvedValue('https://s3.test/signed');
    const controller = new FilesStorageController(
      {} as never,
      { getPresignedDownloadUrlForStoredKey } as never,
      {} as never,
    );
    const storageKey = 'ingredients/images/random key?part=#preview%2F.png';
    await expect(
      controller.getPresignedDownloadUrlForObjectKey({ storageKey }),
    ).resolves.toEqual({
      downloadUrl: 'https://s3.test/signed',
      expiresIn: 300,
      key: storageKey,
    });
    expect(getPresignedDownloadUrlForStoredKey).toHaveBeenCalledWith(storageKey, 300);
  });

  it.each([undefined, '', '  '])(
    'rejects an empty key %s before signing',
    async (storageKey) => {
      const getPresignedDownloadUrlForStoredKey = vi.fn();
      const controller = new FilesStorageController(
        {} as never,
        { getPresignedDownloadUrlForStoredKey } as never,
        {} as never,
      );
      await expect(
        controller.getPresignedDownloadUrlForObjectKey({ storageKey }),
      ).rejects.toThrow('storageKey is required');
      expect(getPresignedDownloadUrlForStoredKey).not.toHaveBeenCalled();
    },
  );
});
