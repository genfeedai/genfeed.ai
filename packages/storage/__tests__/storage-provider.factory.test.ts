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
    vi.doUnmock('@genfeedai/config');
  });

  it('returns LocalStorageProvider when self-hosted', async () => {
    vi.doMock('@genfeedai/config', () => ({ IS_SELF_HOSTED: true }));
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
    vi.doMock('@genfeedai/config', () => ({ IS_SELF_HOSTED: false }));
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
