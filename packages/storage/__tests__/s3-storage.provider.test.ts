import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockSend = vi.fn();
const clientConfigs: Array<Record<string, unknown>> = [];

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
    clientConfigs.length = 0;
    scratchDir = await fs.mkdtemp(path.join(tmpdir(), 'genfeed-s3-test-'));
  });

  afterEach(async () => {
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
  });

  describe('uploadFromFile', () => {
    it('reads the local file and puts it with inferred content type', async () => {
      mockSend.mockResolvedValue({});
      const source = path.join(scratchDir, 'clip.mp4');
      await fs.writeFile(source, 'video-bytes');
      const provider = new S3StorageProvider({ bucket: 'b' });

      const result = await provider.uploadFromFile('videos/clip.mp4', source);

      expect(result).toBe('videos/clip.mp4');
      const [command] = mockSend.mock.calls[0] as [
        { params: Record<string, unknown> },
      ];
      expect(command.params.Bucket).toBe('b');
      expect(command.params.Key).toBe('videos/clip.mp4');
      expect(command.params.ContentType).toBe('video/mp4');
      expect(command.params.ContentLength).toBe(11);
    });

    it('respects an explicit content type and maps safetensors/pth to octet-stream', async () => {
      mockSend.mockResolvedValue({});
      const source = path.join(scratchDir, 'model.safetensors');
      await fs.writeFile(source, 'weights');
      const provider = new S3StorageProvider({ bucket: 'b' });

      await provider.uploadFromFile('loras/model.safetensors', source);
      await provider.uploadFromFile('loras/model.safetensors', source, 'x/y');

      const [first] = mockSend.mock.calls[0] as [
        { params: Record<string, unknown> },
      ];
      const [second] = mockSend.mock.calls[1] as [
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
