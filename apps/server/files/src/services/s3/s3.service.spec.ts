import { ConfigService } from '@files/config/config.service';
import { S3Service } from '@files/services/s3/s3.service';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { Mock } from 'vitest';

const s3SendMock = vi.hoisted(() => vi.fn());

// Mock AWS SDK. Command classes are invoked with `new`, so their mock
// implementations must be regular functions (arrow functions cannot be
// constructed with `new`).
function commandMock() {
  return vi.fn().mockImplementation(function CommandMock(input: unknown) {
    return { input };
  });
}

vi.mock('@aws-sdk/client-s3', () => ({
  CopyObjectCommand: commandMock(),
  DeleteObjectCommand: commandMock(),
  GetObjectCommand: commandMock(),
  HeadObjectCommand: commandMock(),
  PutObjectCommand: commandMock(),
  S3Client: vi.fn().mockImplementation(function S3ClientMock() {
    return { send: s3SendMock };
  }),
}));

const uploadDoneMock = vi.hoisted(() => vi.fn());
vi.mock('@aws-sdk/lib-storage', () => ({
  Upload: vi.fn().mockImplementation(function UploadMock() {
    return { done: uploadDoneMock };
  }),
}));

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn(),
}));

const safeFetchMock = vi.hoisted(() => vi.fn());
vi.mock('@libs/security/destination-guard', () => ({
  safeFetch: safeFetchMock,
}));

vi.mock('fs', () => ({
  createReadStream: vi.fn(),
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

import * as fs from 'node:fs';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

function asyncIterableOf(chunks: Buffer[]) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) {
        yield chunk;
      }
    },
  };
}

describe('S3Service', () => {
  let service: S3Service;
  let configService: ConfigService;

  const mockConfigService = {
    get: vi.fn((key: string) => {
      const config: Record<string, string> = {
        AWS_ACCESS_KEY_ID: 'test-access-key',
        AWS_REGION: 'us-west-1',
        AWS_S3_BUCKET: 'test-bucket',
        AWS_SECRET_ACCESS_KEY: 'test-secret-key',
        GENFEEDAI_CDN_URL: 'https://cdn.example.com',
      };
      return config[key];
    }),
  };

  const mockLoggerService = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        S3Service,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: LoggerService,
          useValue: mockLoggerService,
        },
      ],
    }).compile();

    service = module.get<S3Service>(S3Service);
    configService = module.get<ConfigService>(ConfigService);
    module.get<LoggerService>(LoggerService);

    (fs.existsSync as Mock).mockReturnValue(true);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should initialize S3 client with correct configuration', () => {
    expect(configService.get).toHaveBeenCalledWith('AWS_REGION');
    expect(configService.get).toHaveBeenCalledWith('AWS_ACCESS_KEY_ID');
    expect(configService.get).toHaveBeenCalledWith('AWS_SECRET_ACCESS_KEY');
  });

  it('builds a legitimate nested key under the ingredients prefix', () => {
    expect(
      service.generateS3Key('images', 'organizations/org-1/nested/photo.png'),
    ).toBe('ingredients/images/organizations/org-1/nested/photo.png');
  });

  it.each([
    ['../images', 'photo.png'],
    ['images', '../../escaped.png'],
    ['images', '/absolute.png'],
  ])('rejects key traversal in %s/%s', (type, id) => {
    expect(() => service.generateS3Key(type, id)).toThrow(BadRequestException);
  });

  it('rejects an out-of-root local download path before contacting S3', async () => {
    await expect(
      service.downloadFile('images/photo.png', '/etc/escaped.png'),
    ).rejects.toThrow(BadRequestException);
  });

  it('accepts a legitimate nested object key for public URLs', () => {
    expect(service.getPublicUrl('images/nested/photo.png')).toBe(
      'https://cdn.example.com/images/nested/photo.png',
    );
  });

  describe('uploadFile', () => {
    it('uploads the file and returns its public location', async () => {
      uploadDoneMock.mockResolvedValue({ ETag: 'etag-1' });

      const result = await service.uploadFile(
        'videos/output.mp4',
        'videos/output.mp4',
        'video/mp4',
      );

      expect(fs.createReadStream).toHaveBeenCalled();
      expect(result).toEqual({
        ETag: 'etag-1',
        Key: 'videos/output.mp4',
        Location: 'https://cdn.example.com/videos/output.mp4',
      });
    });

    it('rejects a local path outside the temp root', async () => {
      await expect(
        service.uploadFile('videos/output.mp4', '/etc/escaped.mp4'),
      ).rejects.toThrow(BadRequestException);
    });

    it('logs and rethrows when the upload fails', async () => {
      uploadDoneMock.mockRejectedValue(new Error('upload failed'));

      await expect(
        service.uploadFile('videos/output.mp4', 'videos/output.mp4'),
      ).rejects.toThrow('upload failed');
    });
  });

  describe('uploadBuffer', () => {
    it('uploads a buffer and returns its public location', async () => {
      s3SendMock.mockResolvedValue({ ETag: 'etag-2' });

      const result = await service.uploadBuffer(
        'images/thumb.jpg',
        Buffer.from('data'),
        'image/jpeg',
      );

      expect(s3SendMock).toHaveBeenCalled();
      expect(result.Location).toBe('https://cdn.example.com/images/thumb.jpg');
    });

    it('rethrows on S3 error', async () => {
      s3SendMock.mockRejectedValue(new Error('s3 unavailable'));

      await expect(
        service.uploadBuffer('images/thumb.jpg', Buffer.from('data')),
      ).rejects.toThrow('s3 unavailable');
    });
  });

  describe('downloadFile', () => {
    it('streams the object body to disk', async () => {
      s3SendMock.mockResolvedValue({
        Body: asyncIterableOf([Buffer.from('chunk-1'), Buffer.from('chunk-2')]),
      });
      (fs.existsSync as Mock).mockReturnValue(false);

      await service.downloadFile('videos/input.mp4', 'videos/input.mp4');

      expect(fs.mkdirSync).toHaveBeenCalled();
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('videos/input.mp4'),
        Buffer.concat([Buffer.from('chunk-1'), Buffer.from('chunk-2')]),
      );
    });

    it('logs and rethrows when S3 send fails', async () => {
      s3SendMock.mockRejectedValue(new Error('object missing'));

      await expect(
        service.downloadFile('videos/input.mp4', 'videos/input.mp4'),
      ).rejects.toThrow('object missing');
    });
  });

  describe('downloadFromUrl', () => {
    it('downloads and writes the response body', async () => {
      safeFetchMock.mockResolvedValue({
        arrayBuffer: async () => Buffer.from('remote-data').buffer,
        ok: true,
      });
      (fs.existsSync as Mock).mockReturnValue(false);

      await service.downloadFromUrl(
        'https://example.com/file.mp4',
        'videos/downloaded.mp4',
      );

      expect(fs.mkdirSync).toHaveBeenCalled();
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it('rejects a local path outside the temp root before fetching', async () => {
      await expect(
        service.downloadFromUrl(
          'https://example.com/file.mp4',
          '/etc/escaped.mp4',
        ),
      ).rejects.toThrow(BadRequestException);
      expect(safeFetchMock).not.toHaveBeenCalled();
    });

    it('throws with the parsed error detail on a non-ok response', async () => {
      safeFetchMock.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        text: async () => JSON.stringify({ message: 'missing object' }),
      });

      await expect(
        service.downloadFromUrl(
          'https://example.com/missing.mp4',
          'videos/missing.mp4',
        ),
      ).rejects.toThrow('missing object');
    });

    it('falls back to raw text when the error body is not JSON', async () => {
      safeFetchMock.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Server Error',
        text: async () => 'plain text error',
      });

      await expect(
        service.downloadFromUrl(
          'https://example.com/broken.mp4',
          'videos/broken.mp4',
        ),
      ).rejects.toThrow('plain text error');
    });
  });

  describe('deleteFile', () => {
    it('deletes the object', async () => {
      s3SendMock.mockResolvedValue({});

      await service.deleteFile('videos/old.mp4');

      expect(s3SendMock).toHaveBeenCalled();
    });

    it('logs and rethrows when delete fails', async () => {
      s3SendMock.mockRejectedValue(new Error('delete failed'));

      await expect(service.deleteFile('videos/old.mp4')).rejects.toThrow(
        'delete failed',
      );
    });
  });

  describe('getPresignedUploadUrl', () => {
    it('returns the presigned upload and public URLs', async () => {
      (getSignedUrl as Mock).mockResolvedValue(
        'https://s3.amazonaws.com/presigned-upload',
      );

      const result = await service.getPresignedUploadUrl('videos/new.mp4');

      expect(result).toEqual({
        publicUrl: 'https://cdn.example.com/videos/new.mp4',
        uploadUrl: 'https://s3.amazonaws.com/presigned-upload',
      });
    });

    it('logs and rethrows when signing fails', async () => {
      (getSignedUrl as Mock).mockRejectedValue(new Error('signing failed'));

      await expect(
        service.getPresignedUploadUrl('videos/new.mp4'),
      ).rejects.toThrow('signing failed');
    });
  });

  describe('getPresignedDownloadUrl', () => {
    it('returns a presigned download URL', async () => {
      (getSignedUrl as Mock).mockResolvedValue(
        'https://s3.amazonaws.com/presigned-download',
      );

      const result = await service.getPresignedDownloadUrl('videos/new.mp4');

      expect(result).toBe('https://s3.amazonaws.com/presigned-download');
    });

    it('logs and rethrows when signing fails', async () => {
      (getSignedUrl as Mock).mockRejectedValue(new Error('signing failed'));

      await expect(
        service.getPresignedDownloadUrl('videos/new.mp4'),
      ).rejects.toThrow('signing failed');
    });
  });

  describe('copyFile', () => {
    it('copies the object between keys', async () => {
      s3SendMock.mockResolvedValue({});

      await service.copyFile('videos/source.mp4', 'videos/destination.mp4');

      expect(s3SendMock).toHaveBeenCalled();
    });

    it('logs and rethrows when the copy fails', async () => {
      s3SendMock.mockRejectedValue(new Error('copy failed'));

      await expect(
        service.copyFile('videos/source.mp4', 'videos/destination.mp4'),
      ).rejects.toThrow('copy failed');
    });
  });

  describe('getFileStream', () => {
    it('returns the object body stream', async () => {
      const body = asyncIterableOf([Buffer.from('data')]);
      s3SendMock.mockResolvedValue({ Body: body });

      const result = await service.getFileStream('videos/stream.mp4');

      expect(result).toBe(body);
    });

    it('logs and rethrows when the request fails', async () => {
      s3SendMock.mockRejectedValue(new Error('stream failed'));

      await expect(service.getFileStream('videos/stream.mp4')).rejects.toThrow(
        'stream failed',
      );
    });
  });
});
