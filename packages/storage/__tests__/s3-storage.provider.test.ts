import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  clientConfigs,
  fromIniMock,
  mockSend,
  profileCredentialProvider,
  uploadCtorMock,
  uploadDoneMock,
} = vi.hoisted(() => {
  const profileCredentialProvider = vi.fn();
  return {
    clientConfigs: [] as Array<Record<string, unknown>>,
    fromIniMock: vi.fn(() => profileCredentialProvider),
    mockSend: vi.fn(),
    profileCredentialProvider,
    uploadCtorMock: vi.fn(),
    uploadDoneMock: vi.fn(),
  };
});

vi.mock('@aws-sdk/credential-provider-ini', () => ({
  fromIni: fromIniMock,
}));

vi.mock('@aws-sdk/lib-storage', () => ({
  Upload: class {
    constructor(config: Record<string, unknown>) {
      uploadCtorMock(config);
    }
    done = uploadDoneMock;
  },
}));

vi.mock('@aws-sdk/client-s3', () => {
  class MockS3Client {
    send = mockSend;
    constructor(config: Record<string, unknown>) {
      clientConfigs.push(config);
    }
  }
  class MockCommand {
    constructor(public params: Record<string, unknown>) {}
  }
  return {
    DeleteObjectCommand: class extends MockCommand {},
    GetObjectCommand: class extends MockCommand {},
    HeadObjectCommand: class extends MockCommand {},
    ListObjectsV2Command: class extends MockCommand {},
    PutObjectCommand: class extends MockCommand {},
    S3Client: MockS3Client,
  };
});

import { S3StorageProvider } from '../src/s3-storage.provider';

describe('S3StorageProvider', () => {
  let scratchDir: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.stubEnv('AWS_PROFILE', '');
    vi.stubEnv('GENFEEDAI_CDN_URL', '');
    clientConfigs.length = 0;
    scratchDir = await fs.mkdtemp(path.join(tmpdir(), 'genfeed-s3-test-'));
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await fs.rm(scratchDir, { force: true, recursive: true });
  });

  describe('constructor options', () => {
    it('uses explicit options over environment', () => {
      const provider = new S3StorageProvider({
        accessKeyId: 'ak',
        bucket: 'opt-bucket',
        region: 'eu-west-3',
        secretAccessKey: 'sk',
      });

      expect(provider.getUrl('a.png')).toBe(
        'https://opt-bucket.s3.eu-west-3.amazonaws.com/a.png',
      );
      expect(clientConfigs[0]).toMatchObject({
        credentials: { accessKeyId: 'ak', secretAccessKey: 'sk' },
        region: 'eu-west-3',
      });
    });

    it('uses an explicit AWS profile instead of stale static credentials', () => {
      vi.stubEnv('AWS_ACCESS_KEY_ID', 'stale-access-key');
      vi.stubEnv('AWS_SECRET_ACCESS_KEY', 'stale-secret-key');

      new S3StorageProvider({ bucket: 'profile-bucket', profile: 'genfeedai' });

      expect(fromIniMock).toHaveBeenCalledWith({ profile: 'genfeedai' });
      expect(clientConfigs[0]).toMatchObject({
        credentials: profileCredentialProvider,
      });
    });

    it('publishes through GENFEEDAI_CDN_URL instead of the raw S3 host', () => {
      vi.stubEnv('GENFEEDAI_CDN_URL', 'https://staging-cdn.genfeed.ai');
      const provider = new S3StorageProvider({
        bucket: 'staging-cdn.genfeed.ai',
        region: 'us-east-1',
      });

      expect(
        provider.getUrl('ingredients/images/c000000000000000000000001'),
      ).toBe(
        'https://staging-cdn.genfeed.ai/ingredients/images/c000000000000000000000001',
      );
    });

    it('uses an explicit cdnUrl option over the files microservice origin', () => {
      vi.stubEnv('GENFEEDAI_CDN_URL', 'https://files.genfeed.localhost');
      const provider = new S3StorageProvider({
        bucket: 'staging-cdn.genfeed.ai',
        cdnUrl: 'https://staging-cdn.genfeed.ai',
      });

      expect(provider.getUrl('ingredients/images/x')).toBe(
        'https://staging-cdn.genfeed.ai/ingredients/images/x',
      );
    });
  });

  describe('object-key containment', () => {
    it.each([
      '../escaped.png',
      '/absolute.png',
      'nested\\escaped.png',
      'nested/%2e%2e/escaped.png',
      'nested/%252e%252e/escaped.png',
      'nested%2fescaped.png',
    ])('rejects unsafe key %s before sending an S3 command', async (key) => {
      const provider = new S3StorageProvider({ bucket: 'b' });

      await expect(
        provider.upload(Buffer.from('payload'), key),
      ).rejects.toThrow(Error);

      expect(mockSend).not.toHaveBeenCalled();
    });

    it('accepts and preserves a legitimate nested object key', async () => {
      mockSend.mockResolvedValue({});
      const provider = new S3StorageProvider({ bucket: 'b' });

      await expect(
        provider.upload(
          Buffer.from('payload'),
          'images/org-1/nested/photo.png',
        ),
      ).resolves.toBe('images/org-1/nested/photo.png');

      const [command] = mockSend.mock.calls[0] as [
        { params: Record<string, unknown> },
      ];
      expect(command.params.Key).toBe('images/org-1/nested/photo.png');
    });
  });

  describe('uploadFromFile', () => {
    it('streams the local file through lib-storage Upload', async () => {
      uploadDoneMock.mockResolvedValue({});
      const source = path.join(scratchDir, 'clip.mp4');
      await fs.writeFile(source, 'video-bytes');
      const provider = new S3StorageProvider({ bucket: 'b' });

      const result = await provider.uploadFromFile(
        'videos/clip.mp4',
        source,
        scratchDir,
      );

      expect(result).toBe('videos/clip.mp4');
      expect(mockSend).not.toHaveBeenCalled();
      expect(uploadCtorMock).toHaveBeenCalledWith(
        expect.objectContaining({
          params: expect.objectContaining({
            Bucket: 'b',
            ContentLength: 11,
            ContentType: 'video/mp4',
            Key: 'videos/clip.mp4',
          }),
        }),
      );
      const [config] = uploadCtorMock.mock.calls[0] as [
        { params: { Body: unknown } },
      ];
      expect(Buffer.isBuffer(config.params.Body)).toBe(false);
    });

    it.each([
      '../outside.mp4',
      'nested\\outside.mp4',
      'nested/%2e%2e/outside.mp4',
      'nested/%252e%252e/outside.mp4',
    ])(
      'rejects unsafe local source %s before filesystem access',
      async (source) => {
        const provider = new S3StorageProvider({ bucket: 'b' });

        await expect(
          provider.uploadFromFile('videos/clip.mp4', source, scratchDir),
        ).rejects.toThrow(Error);

        expect(uploadCtorMock).not.toHaveBeenCalled();
      },
    );

    it('respects an explicit content type and maps safetensors/pth to octet-stream', async () => {
      uploadDoneMock.mockResolvedValue({});
      const source = path.join(scratchDir, 'model.safetensors');
      await fs.writeFile(source, 'weights');
      const provider = new S3StorageProvider({ bucket: 'b' });

      await provider.uploadFromFile(
        'loras/model.safetensors',
        source,
        scratchDir,
      );
      await provider.uploadFromFile(
        'loras/model.safetensors',
        source,
        scratchDir,
        'x/y',
      );

      const [first] = uploadCtorMock.mock.calls[0] as [
        { params: Record<string, unknown> },
      ];
      const [second] = uploadCtorMock.mock.calls[1] as [
        { params: Record<string, unknown> },
      ];
      expect(first.params.ContentType).toBe('application/octet-stream');
      expect(second.params.ContentType).toBe('x/y');
    });
  });

  describe('download', () => {
    it('streams the object body to a local path, creating directories', async () => {
      mockSend.mockResolvedValue({
        Body: Readable.from(Buffer.from('object-bytes')),
      });
      const provider = new S3StorageProvider({ bucket: 'b' });
      const target = path.join(scratchDir, 'nested/dir/out.png');

      await provider.download('images/out.png', target);

      const [command] = mockSend.mock.calls[0] as [
        { params: Record<string, unknown> },
      ];
      expect(command.params).toMatchObject({
        Bucket: 'b',
        Key: 'images/out.png',
      });
      expect(await fs.readFile(target, 'utf8')).toBe('object-bytes');
    });

    it('throws on empty response body', async () => {
      mockSend.mockResolvedValue({ Body: undefined });
      const provider = new S3StorageProvider({ bucket: 'b' });

      await expect(
        provider.download('images/out.png', path.join(scratchDir, 'x.png')),
      ).rejects.toThrow('Empty response body');
    });
  });

  describe('delete', () => {
    it('sends a DeleteObjectCommand for the validated key', async () => {
      mockSend.mockResolvedValue({});
      const provider = new S3StorageProvider({ bucket: 'b' });

      await provider.delete('images/old.png');

      const [command] = mockSend.mock.calls[0] as [
        { params: Record<string, unknown> },
      ];
      expect(command.params).toMatchObject({
        Bucket: 'b',
        Key: 'images/old.png',
      });
    });

    it('rejects traversal before sending a delete command', async () => {
      const provider = new S3StorageProvider({ bucket: 'b' });

      await expect(provider.delete('a/../../etc/passwd')).rejects.toThrow(
        /invalid path segment/,
      );
      expect(mockSend).not.toHaveBeenCalled();
    });
  });

  describe('list', () => {
    it('maps S3 contents to file entries with url, type and metadata', async () => {
      const modifiedAt = new Date('2024-03-01');
      mockSend.mockResolvedValue({
        Contents: [
          { Key: 'p/photo.png', LastModified: modifiedAt, Size: 10 },
          { Key: 'p/clip.mov', LastModified: modifiedAt, Size: 20 },
          { Key: 'p/song.flac', LastModified: modifiedAt, Size: 30 },
          { Key: 'p/notes.txt', LastModified: modifiedAt, Size: 40 },
        ],
      });
      const provider = new S3StorageProvider({
        bucket: 'b',
        region: 'us-west-2',
      });

      const entries = await provider.list('p/');

      expect(entries).toEqual([
        {
          modifiedAt,
          name: 'photo.png',
          path: 'p/photo.png',
          size: 10,
          type: 'image',
          url: 'https://b.s3.us-west-2.amazonaws.com/p/photo.png',
        },
        {
          modifiedAt,
          name: 'clip.mov',
          path: 'p/clip.mov',
          size: 20,
          type: 'video',
          url: 'https://b.s3.us-west-2.amazonaws.com/p/clip.mov',
        },
        {
          modifiedAt,
          name: 'song.flac',
          path: 'p/song.flac',
          size: 30,
          type: 'audio',
          url: 'https://b.s3.us-west-2.amazonaws.com/p/song.flac',
        },
        {
          modifiedAt,
          name: 'notes.txt',
          path: 'p/notes.txt',
          size: 40,
          type: 'file',
          url: 'https://b.s3.us-west-2.amazonaws.com/p/notes.txt',
        },
      ]);
    });

    it('defaults missing Key, Size and LastModified fields', async () => {
      mockSend.mockResolvedValue({
        Contents: [
          { Key: undefined, LastModified: undefined, Size: undefined },
        ],
      });
      const provider = new S3StorageProvider({ bucket: 'b', region: 'r' });

      const entries = await provider.list('');

      expect(entries).toHaveLength(1);
      expect(entries[0].name).toBe('');
      expect(entries[0].path).toBe('');
      expect(entries[0].size).toBe(0);
      expect(entries[0].type).toBe('file');
      expect(entries[0].modifiedAt).toBeInstanceOf(Date);
    });

    it('returns an empty list when the response has no Contents', async () => {
      mockSend.mockResolvedValue({});
      const provider = new S3StorageProvider({ bucket: 'b' });

      await expect(provider.list('p/')).resolves.toEqual([]);
    });

    it('filters by type and applies offset and limit after filtering', async () => {
      const modifiedAt = new Date('2024-03-01');
      mockSend.mockResolvedValue({
        Contents: [
          { Key: 'p/a.png', LastModified: modifiedAt, Size: 1 },
          { Key: 'p/skip.mp4', LastModified: modifiedAt, Size: 2 },
          { Key: 'p/b.jpg', LastModified: modifiedAt, Size: 3 },
          { Key: 'p/c.webp', LastModified: modifiedAt, Size: 4 },
        ],
      });
      const provider = new S3StorageProvider({ bucket: 'b' });

      const entries = await provider.list('p/', {
        limit: 1,
        offset: 1,
        type: 'image',
      });

      expect(entries).toHaveLength(1);
      expect(entries[0].path).toBe('p/b.jpg');
      const [command] = mockSend.mock.calls[0] as [
        { params: Record<string, unknown> },
      ];
      expect(command.params.MaxKeys).toBe(2);
      expect(command.params.Prefix).toBe('p/');
    });

    it('keeps every entry when type filter is "all"', async () => {
      mockSend.mockResolvedValue({
        Contents: [
          { Key: 'p/a.png', LastModified: new Date(), Size: 1 },
          { Key: 'p/b.mp4', LastModified: new Date(), Size: 2 },
        ],
      });
      const provider = new S3StorageProvider({ bucket: 'b' });

      const entries = await provider.list('p/', { type: 'all' });

      expect(entries).toHaveLength(2);
    });

    it('rejects an unsafe prefix before sending a list command', async () => {
      const provider = new S3StorageProvider({ bucket: 'b' });

      await expect(provider.list('../other-tenant/')).rejects.toThrow(
        /invalid path segment/,
      );
      expect(mockSend).not.toHaveBeenCalled();
    });
  });

  describe('exists', () => {
    it('returns true when the head request succeeds', async () => {
      mockSend.mockResolvedValue({});
      const provider = new S3StorageProvider({ bucket: 'b' });

      await expect(provider.exists('images/a.png')).resolves.toBe(true);
      const [command] = mockSend.mock.calls[0] as [
        { params: Record<string, unknown> },
      ];
      expect(command.params).toMatchObject({
        Bucket: 'b',
        Key: 'images/a.png',
      });
    });

    it.each(['NotFound', 'NoSuchKey'])(
      'returns false when the head request fails with %s',
      async (errorName) => {
        const error = new Error('missing');
        error.name = errorName;
        mockSend.mockRejectedValue(error);
        const provider = new S3StorageProvider({ bucket: 'b' });

        await expect(provider.exists('images/a.png')).resolves.toBe(false);
      },
    );

    it('rethrows unexpected errors', async () => {
      const error = new Error('denied');
      error.name = 'AccessDenied';
      mockSend.mockRejectedValue(error);
      const provider = new S3StorageProvider({ bucket: 'b' });

      await expect(provider.exists('images/a.png')).rejects.toThrow('denied');
    });
  });

  describe('listObjects', () => {
    it('paginates through continuation tokens and maps object metadata', async () => {
      mockSend
        .mockResolvedValueOnce({
          Contents: [
            { Key: 'p/a.png', LastModified: new Date('2024-01-01'), Size: 1 },
          ],
          NextContinuationToken: 'token',
        })
        .mockResolvedValueOnce({
          Contents: [
            { Key: 'p/b.png', LastModified: new Date('2024-01-02'), Size: 2 },
          ],
          NextContinuationToken: undefined,
        });
      const provider = new S3StorageProvider({ bucket: 'b' });

      const objects = await provider.listObjects('p/');

      expect(mockSend).toHaveBeenCalledTimes(2);
      expect(objects).toEqual([
        { key: 'p/a.png', lastModified: new Date('2024-01-01'), size: 1 },
        { key: 'p/b.png', lastModified: new Date('2024-01-02'), size: 2 },
      ]);
      const [secondCall] = mockSend.mock.calls[1] as [
        { params: Record<string, unknown> },
      ];
      expect(secondCall.params.ContinuationToken).toBe('token');
    });

    it('skips entries missing Key or Size and handles empty listings', async () => {
      mockSend.mockResolvedValue({
        Contents: [
          { Key: 'p/ok.png', LastModified: new Date(), Size: 5 },
          { Key: undefined, LastModified: new Date(), Size: 1 },
          { Key: 'p/no-size.png', LastModified: new Date(), Size: undefined },
        ],
      });
      const provider = new S3StorageProvider({ bucket: 'b' });

      const objects = await provider.listObjects('p/');

      expect(objects).toHaveLength(1);
      expect(objects[0].key).toBe('p/ok.png');
    });
  });
});
