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
    expect(getPresignedDownloadUrlForStoredKey).toHaveBeenCalledWith(
      storageKey,
      300,
    );
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

describe('FilesStorageController stored object existence', () => {
  it('reports existence for one trimmed full storage key', async () => {
    const storedObjectExists = vi.fn().mockResolvedValue(true);
    const controller = new FilesStorageController(
      {} as never,
      {} as never,
      { storedObjectExists } as never,
    );

    await expect(
      controller.storedObjectExists({ storageKey: ' ingredients/images/a ' }),
    ).resolves.toEqual({ exists: true, storageKey: 'ingredients/images/a' });
    expect(storedObjectExists).toHaveBeenCalledWith('ingredients/images/a');
  });

  it.each([undefined, '', '  '])(
    'rejects an empty key %s before touching storage',
    async (storageKey) => {
      const storedObjectExists = vi.fn();
      const controller = new FilesStorageController(
        {} as never,
        {} as never,
        { storedObjectExists } as never,
      );

      await expect(
        controller.storedObjectExists({ storageKey }),
      ).rejects.toThrow('storageKey is required');
      expect(storedObjectExists).not.toHaveBeenCalled();
    },
  );
});
