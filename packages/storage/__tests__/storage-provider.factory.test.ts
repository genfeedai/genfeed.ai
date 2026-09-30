import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@aws-sdk/client-s3', () => ({
  DeleteObjectCommand: class {},
  GetObjectCommand: class {},
  HeadObjectCommand: class {},
  ListObjectsV2Command: class {},
  PutObjectCommand: class {},
  S3Client: class {},
}));

describe('createStorageProvider', () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.doUnmock('@genfeedai/config');
  });

  it('roots the local driver at the desktop userData directory', async () => {
    vi.doMock('@genfeedai/config', () => ({
      isDesktopClient: () => true,
      isSelfHostedDeployment: () => true,
    }));
    const { createStorageProvider } = await import(
      '../src/storage-provider.factory'
    );
    const userDataDir = await fs.mkdtemp(
      path.join(tmpdir(), 'genfeed-user-data-'),
    );
    vi.stubEnv('GENFEED_DESKTOP_DATA_DIR', userDataDir);
    vi.stubEnv('GENFEED_STORAGE_PATH', '');

    try {
      const provider = createStorageProvider();
      await provider.upload(Buffer.from('payload'), 'ingredients/photo.png');

      expect(
        await fs.readFile(
          path.join(userDataDir, 'files/ingredients/photo.png'),
          'utf8',
        ),
      ).toBe('payload');
    } finally {
      await fs.rm(userDataDir, { force: true, recursive: true });
    }
  });

  it('returns LocalStorageProvider when self-hosted', async () => {
    vi.doMock('@genfeedai/config', () => ({
      isDesktopClient: () => false,
      isSelfHostedDeployment: () => true,
    }));
    const { createStorageProvider } = await import(
      '../src/storage-provider.factory'
    );
    const { LocalStorageProvider } = await import(
      '../src/local-storage.provider'
    );
    const baseDir = await fs.mkdtemp(path.join(tmpdir(), 'genfeed-factory-'));

    try {
      expect(createStorageProvider({ baseDir })).toBeInstanceOf(
        LocalStorageProvider,
      );
    } finally {
      await fs.rm(baseDir, { force: true, recursive: true });
    }
  });

  it('returns S3StorageProvider with options when cloud', async () => {
    vi.stubEnv('GENFEEDAI_CDN_URL', '');
    vi.doMock('@genfeedai/config', () => ({
      isDesktopClient: () => false,
      isSelfHostedDeployment: () => false,
    }));
    const { createStorageProvider } = await import(
      '../src/storage-provider.factory'
    );
    const { S3StorageProvider } = await import('../src/s3-storage.provider');

    const provider = createStorageProvider({
      bucket: 'my-bucket',
      region: 'eu-central-1',
    });

    expect(provider).toBeInstanceOf(S3StorageProvider);
    expect(provider.getUrl('k.png')).toBe(
      'https://my-bucket.s3.eu-central-1.amazonaws.com/k.png',
    );
  });
});
