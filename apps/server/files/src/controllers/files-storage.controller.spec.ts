import { FilesStorageController } from '@files/controllers/files-storage.controller';
import {
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';

describe('FilesStorageController exact stored object signing', () => {
  it('preserves reserved characters in the JSON storage key', async () => {
    const getPresignedDownloadUrlForStoredKey = vi
      .fn()
      .mockResolvedValue('https://s3.test/signed');
    const controller = new FilesStorageController(
      {} as never,
      { getPresignedDownloadUrlForStoredKey } as never,
      {} as never,
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
  const SERVICE_KEY = 'service-key';

  function createController(
    storedObjectExists = vi.fn(),
    expectedKey: string | null = SERVICE_KEY,
  ) {
    return {
      controller: new FilesStorageController(
        {} as never,
        {} as never,
        { storedObjectExists } as never,
        { get: vi.fn().mockReturnValue(expectedKey ?? undefined) } as never,
      ),
      storedObjectExists,
    };
  }

  it('reports existence for one trimmed full storage key', async () => {
    const { controller, storedObjectExists } = createController(
      vi.fn().mockResolvedValue(true),
    );

    await expect(
      controller.storedObjectExists(SERVICE_KEY, {
        storageKey: ' ingredients/images/a ',
      }),
    ).resolves.toEqual({ exists: true, storageKey: 'ingredients/images/a' });
    expect(storedObjectExists).toHaveBeenCalledWith('ingredients/images/a');
  });

  it.each([undefined, '', '  '])(
    'rejects an empty key %s before touching storage',
    async (storageKey) => {
      const { controller, storedObjectExists } = createController();

      await expect(
        controller.storedObjectExists(SERVICE_KEY, { storageKey }),
      ).rejects.toThrow('storageKey is required');
      expect(storedObjectExists).not.toHaveBeenCalled();
    },
  );

  it.each([undefined, 'wrong-key', 'service-ke'])(
    'rejects service key %s before touching storage',
    async (suppliedKey) => {
      const { controller, storedObjectExists } = createController();

      await expect(
        controller.storedObjectExists(suppliedKey, { storageKey: 'a/b' }),
      ).rejects.toThrow(UnauthorizedException);
      expect(storedObjectExists).not.toHaveBeenCalled();
    },
  );

  it('is unavailable while no service key is configured', async () => {
    const { controller, storedObjectExists } = createController(vi.fn(), null);

    await expect(
      controller.storedObjectExists(SERVICE_KEY, { storageKey: 'a/b' }),
    ).rejects.toThrow(ServiceUnavailableException);
    expect(storedObjectExists).not.toHaveBeenCalled();
  });
});
