import path from 'node:path';
import { ConfigService } from '@files/config/config.service';
import { FILES_TMP_ROOT } from '@files/constants/path.constants';
import { FFmpegService } from '@files/services/ffmpeg/services/ffmpeg.service';
import { FileRuntimeSettingsService } from '@files/services/runtime-settings/file-runtime-settings.service';
import { UploadService } from '@files/services/upload/upload.service';
import {
  UNATTRIBUTED_FORWARDED_HEADER,
  UNATTRIBUTED_FORWARDED_VALUE,
} from '@genfeedai/contracts/constants';
import type { StorageProvider } from '@genfeedai/storage';
import { LoggerService } from '@libs/logger/logger.service';
import {
  DestinationGuardError,
  safeFetch,
} from '@libs/security/destination-guard';
import { HttpException, HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { Mock, Mocked } from 'vitest';

const isSelfHostedDeploymentMock = vi.hoisted(() => vi.fn(() => false));
vi.mock('@genfeedai/config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@genfeedai/config')>()),
  isSelfHostedDeployment: isSelfHostedDeploymentMock,
}));

vi.mock('@libs/security/destination-guard', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@libs/security/destination-guard')
  >()),
  safeFetch: vi.fn(),
}));

// Mock sharp
vi.mock('sharp', () => {
  const mockSharp = vi.fn().mockImplementation(() => ({
    jpeg: vi.fn().mockReturnThis(),
    metadata: vi.fn().mockResolvedValue({ height: 1080, width: 1920 }),
    png: vi.fn().mockReturnThis(),
    rotate: vi.fn().mockReturnThis(),
    toBuffer: vi.fn().mockResolvedValue(Buffer.from('processed-image')),
    webp: vi.fn().mockReturnThis(),
  }));
  return { default: mockSharp };
});

const pipelineMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock('node:stream/promises', () => ({
  pipeline: pipelineMock,
}));

// Mock fs
vi.mock('fs', () => ({
  createWriteStream: vi.fn(),
  existsSync: vi.fn().mockReturnValue(true),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn().mockReturnValue(Buffer.from('file-content')),
  statSync: vi.fn().mockReturnValue({ size: 17 }),
  unlinkSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

import * as fs from 'node:fs';
import sharp from 'sharp';

type ConfigKey = Parameters<ConfigService['get']>[0];

type MockSharpInstance = {
  jpeg: Mock;
  metadata: Mock;
  png: Mock;
  rotate: Mock;
  toBuffer: Mock;
  webp: Mock;
};

function remoteResponse(
  data: string,
  headers: Record<string, string> = {},
  status = 200,
): Response {
  return new Response(Buffer.from(data), { headers, status });
}

async function rejectionStatus(promise: Promise<unknown>): Promise<number> {
  const error = await promise.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(HttpException);
  return (error as HttpException).getStatus();
}

describe('UploadService', () => {
  let service: UploadService;
  let mockConfigService: Mocked<ConfigService>;
  let mockFfmpegService: Mocked<FFmpegService>;
  const safeFetchMock = vi.mocked(safeFetch);
  let mockLogger: Mocked<LoggerService>;
  let mockStorage: Mocked<StorageProvider>;
  let mockSharpInstance: MockSharpInstance;

  beforeEach(async () => {
    mockConfigService = {
      get: vi.fn().mockReturnValue('90'),
    } as unknown as Mocked<ConfigService>;

    mockFfmpegService = {
      getVideoMetadata: vi.fn().mockResolvedValue({
        format: { duration: 60 },
        streams: [
          { codec_type: 'video', height: 1080, width: 1920 },
          { codec_type: 'audio' },
        ],
      }),
    } as unknown as Mocked<FFmpegService>;

    mockLogger = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    } as unknown as Mocked<LoggerService>;

    mockStorage = {
      delete: vi.fn().mockResolvedValue(undefined),
      getUrl: vi.fn().mockReturnValue('https://s3.example.com/test-key'),
      upload: vi.fn().mockResolvedValue('ingredients/images/test-key'),
      uploadFromFile: vi.fn().mockResolvedValue('ingredients/videos/test-key'),
    } as unknown as Mocked<StorageProvider>;

    // Reset sharp mock
    mockSharpInstance = {
      jpeg: vi.fn().mockReturnThis(),
      metadata: vi.fn().mockResolvedValue({ height: 1080, width: 1920 }),
      png: vi.fn().mockReturnThis(),
      rotate: vi.fn().mockReturnThis(),
      toBuffer: vi.fn().mockResolvedValue(Buffer.from('processed-image')),
      webp: vi.fn().mockReturnThis(),
    };
    (sharp as Mock).mockReturnValue(mockSharpInstance);

    // Reset fs mocks
    (fs.existsSync as Mock).mockReturnValue(true);
    (fs.readFileSync as Mock).mockReturnValue(Buffer.from('file-content'));
    (fs.statSync as Mock).mockReturnValue({ size: 17 });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: FileRuntimeSettingsService,
          useValue: {
            get: async () => ({
              imageCompressionQuality: Number(
                mockConfigService.get('AWS_IMAGE_COMPRESSION') || 50,
              ),
            }),
          },
        },
        UploadService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: FFmpegService, useValue: mockFfmpegService },
        { provide: LoggerService, useValue: mockLogger },
        { provide: 'STORAGE_PROVIDER', useValue: mockStorage },
      ],
    }).compile();

    service = module.get<UploadService>(UploadService);

    vi.clearAllMocks();
    (sharp as Mock).mockReturnValue(mockSharpInstance);
    (fs.existsSync as Mock).mockReturnValue(true);
    (fs.readFileSync as Mock).mockReturnValue(Buffer.from('file-content'));
    (fs.statSync as Mock).mockReturnValue({ size: 17 });
    pipelineMock.mockResolvedValue(undefined);
    isSelfHostedDeploymentMock.mockReturnValue(false);
  });

  it('deletes a validated full storage key through the configured provider', async () => {
    await service.deleteStoredObject('videos/source.mp4');

    expect(mockStorage.delete).toHaveBeenCalledWith('videos/source.mp4');
  });

  describe('initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });
  });

  describe('uploadToS3 - file source', () => {
    it('rejects a file source outside the files temp root before reading it', async () => {
      await expect(
        service.uploadToS3('test-key', 'images', {
          path: '/etc/passwd.jpg',
          type: 'file',
        }),
      ).rejects.toThrow(HttpException);

      expect(fs.readFileSync).not.toHaveBeenCalled();
      expect(mockStorage.upload).not.toHaveBeenCalled();
    });

    it.each([
      `${FILES_TMP_ROOT}/nested/../image.jpg`,
      `${FILES_TMP_ROOT}/nested\\image.jpg`,
      `${FILES_TMP_ROOT}/nested/%2e%2e/image.jpg`,
      `${FILES_TMP_ROOT}/nested/%252e%252e/image.jpg`,
    ])(
      'rejects ambiguous file source %s before reading it',
      async (filePath) => {
        await expect(
          service.uploadToS3('test-key', 'images', {
            path: filePath,
            type: 'file',
          }),
        ).rejects.toThrow(HttpException);

        expect(fs.statSync).not.toHaveBeenCalled();
        expect(mockStorage.upload).not.toHaveBeenCalled();
        expect(mockStorage.uploadFromFile).not.toHaveBeenCalled();
      },
    );

    it('should upload JPEG file with image dimensions', async () => {
      const result = await service.uploadToS3('test-key', 'images', {
        path: path.join(FILES_TMP_ROOT, 'fixtures', 'image.jpg'),
        type: 'file',
      });

      expect(result.width).toBe(1920);
      expect(result.height).toBe(1080);
      expect(result.publicUrl).toBe('https://s3.example.com/test-key');
      expect(result.s3Key).toBe('ingredients/images/test-key');
      expect(mockStorage.upload).toHaveBeenCalled();
    });

    it('accepts a legitimate nested file source under the files temp root', async () => {
      const nestedPath = path.join(
        FILES_TMP_ROOT,
        'nested',
        'uploads',
        'image.jpg',
      );

      await service.uploadToS3('nested/image', 'images', {
        path: nestedPath,
        type: 'file',
      });

      expect(fs.readFileSync).not.toHaveBeenCalled();
      expect(sharp).toHaveBeenCalledWith(nestedPath);
      expect(mockStorage.upload).toHaveBeenCalledWith(
        expect.any(Buffer),
        'ingredients/images/nested/image',
        'image/jpeg',
      );
    });

    it.each(['banners', 'logos', 'references'])(
      'stores %s at the CDN root',
      async (type) => {
        await service.uploadToS3('brand-asset', type, {
          contentType: 'image/png',
          data: Buffer.from('image'),
          type: 'buffer',
        });

        expect(mockStorage.upload).toHaveBeenCalledWith(
          expect.any(Buffer),
          `${type}/brand-asset`,
          'image/png',
        );
      },
    );

    it.each([
      '../../escaped',
      '/absolute',
      'nested\\escaped',
      'nested/%2e%2e/escaped',
      'nested/%252e%252e/escaped',
    ])('rejects unsafe object key %s before storage', async (key) => {
      await expect(
        service.uploadToS3(key, 'images', {
          contentType: 'image/jpeg',
          data: Buffer.from('image'),
          type: 'buffer',
        }),
      ).rejects.toThrow(HttpException);

      expect(mockStorage.upload).not.toHaveBeenCalled();
    });

    it('should upload PNG file', async () => {
      await service.uploadToS3('test-key', 'images', {
        path: path.join(FILES_TMP_ROOT, 'fixtures', 'image.png'),
        type: 'file',
      });

      expect(mockSharpInstance.png).toHaveBeenCalledWith({
        compressionLevel: 9,
        quality: 90,
      });
    });

    it('should upload WebP file', async () => {
      await service.uploadToS3('test-key', 'images', {
        path: path.join(FILES_TMP_ROOT, 'fixtures', 'image.webp'),
        type: 'file',
      });

      expect(mockSharpInstance.webp).toHaveBeenCalledWith({ quality: 90 });
    });

    it('should upload MP4 video file with metadata', async () => {
      const videoPath = path.join(FILES_TMP_ROOT, 'fixtures', 'video.mp4');
      const result = await service.uploadToS3('test-key', 'videos', {
        path: videoPath,
        type: 'file',
      });

      expect(result.width).toBe(1920);
      expect(result.height).toBe(1080);
      expect(result.duration).toBe(60);
      expect(result.hasAudio).toBe(true);
      expect(fs.readFileSync).not.toHaveBeenCalled();
      expect(mockStorage.uploadFromFile).toHaveBeenCalledWith(
        'ingredients/videos/test-key',
        videoPath,
        FILES_TMP_ROOT,
        'video/mp4',
      );
      expect(mockFfmpegService.getVideoMetadata).toHaveBeenCalledWith(
        videoPath,
      );
    });

    it('probes audio files for duration, codec and container', async () => {
      mockFfmpegService.getVideoMetadata.mockResolvedValue({
        format: { duration: 12.5, format_name: 'mp3' },
        streams: [{ codec_name: 'MP3', codec_type: 'audio' }],
      });
      const audioPath = path.join(FILES_TMP_ROOT, 'fixtures', 'voice.mp3');

      const result = await service.uploadToS3('test-key', 'audios', {
        path: audioPath,
        type: 'file',
      });

      expect(mockFfmpegService.getVideoMetadata).toHaveBeenCalledWith(
        audioPath,
      );
      expect(result).toMatchObject({
        audioCodec: 'mp3',
        container: 'mp3',
        duration: 12.5,
        hasAudio: true,
      });
    });

    describe('audio probe path validation', () => {
      // The real probe path guard, not a mock of it: ffprobe is only reached
      // for allowlisted extensions.
      const probeWithRealExtensionGuard = (probedPath: string) => {
        SecurityUtil.validateFileExtension(probedPath);
        return Promise.resolve({
          format: { format_name: 'webm' } as never,
          streams: [{ codec_name: 'opus', codec_type: 'audio' }] as never,
        });
      };

      it.each([
        ['audio/mpeg', '.mp3'],
        ['audio/webm', '.webm'],
        ['audio/mp4', '.m4a'],
        ['audio/opus', '.ogg'],
        ['audio/unknown-type', '.mp3'],
      ])(
        'probes a downloaded %s with an allowlisted extension',
        async (contentType, extension) => {
          mockFfmpegService.getVideoMetadata.mockImplementation(
            probeWithRealExtensionGuard as never,
          );
          safeFetchMock.mockResolvedValue(
            remoteResponse('audio-content', { 'content-type': contentType }),
          );

          const result = await service.uploadToS3('test-key', 'audios', {
            type: 'url',
            url: 'https://example.com/recording',
          });

          expect(result.hasAudio).toBe(true);
          expect(result.duration).toBe(0);
          expect(
            path.extname(
              vi.mocked(mockFfmpegService.getVideoMetadata).mock
                .calls[0]?.[0] ?? '',
            ),
          ).toBe(extension);
        },
      );

      it('probes a valid audio buffer with an allowlisted extension', async () => {
        mockFfmpegService.getVideoMetadata.mockImplementation(
          probeWithRealExtensionGuard as never,
        );

        const result = await service.uploadToS3('test-key', 'audios', {
          contentType: 'audio/webm;codecs=opus',
          data: Buffer.from('recording'),
          type: 'buffer',
        });

        expect(result).toMatchObject({ audioCodec: 'opus', hasAudio: true });
      });
    });

    it('rejects a file declared as audio that has no audio stream', async () => {
      mockFfmpegService.getVideoMetadata.mockResolvedValue({
        format: { duration: 3 },
        streams: [{ codec_type: 'video', height: 10, width: 10 }],
      });

      await expect(
        service.uploadToS3('test-key', 'audios', {
          path: path.join(FILES_TMP_ROOT, 'fixtures', 'fake.mp3'),
          type: 'file',
        }),
      ).rejects.toThrow('no readable audio');
      expect(mockStorage.uploadFromFile).not.toHaveBeenCalled();
    });

    it('rejects corrupt audio that ffprobe cannot read', async () => {
      mockFfmpegService.getVideoMetadata.mockRejectedValue(
        new Error('ffprobe failed'),
      );

      await expect(
        service.uploadToS3('test-key', 'audios', {
          contentType: 'audio/mpeg',
          data: Buffer.from('not audio'),
          type: 'buffer',
        }),
      ).rejects.toThrow('ffprobe failed');
      expect(mockStorage.upload).not.toHaveBeenCalled();
    });

    it('should handle video without audio stream', async () => {
      mockFfmpegService.getVideoMetadata.mockResolvedValue({
        format: { duration: 30 },
        streams: [{ codec_type: 'video', height: 1080, width: 1920 }],
      });

      const result = await service.uploadToS3('test-key', 'videos', {
        path: path.join(FILES_TMP_ROOT, 'fixtures', 'video.mp4'),
        type: 'file',
      });

      expect(result.hasAudio).toBe(false);
    });

    it('should upload ZIP file without image processing', async () => {
      const zipPath = path.join(FILES_TMP_ROOT, 'fixtures', 'archive.zip');
      const result = await service.uploadToS3('test-key', 'archives', {
        path: zipPath,
        type: 'file',
      });

      expect(result.publicUrl).toBe('https://s3.example.com/test-key');
      expect(sharp).not.toHaveBeenCalled();
      expect(mockStorage.uploadFromFile).toHaveBeenCalledWith(
        'ingredients/archives/test-key',
        zipPath,
        FILES_TMP_ROOT,
        'application/zip',
      );
    });

    it('should handle unknown file types as octet-stream', async () => {
      const unknownPath = path.join(FILES_TMP_ROOT, 'fixtures', 'file.unknown');
      await service.uploadToS3('test-key', 'files', {
        path: unknownPath,
        type: 'file',
      });

      expect(mockStorage.uploadFromFile).toHaveBeenCalledWith(
        'ingredients/files/test-key',
        unknownPath,
        FILES_TMP_ROOT,
        'application/octet-stream',
      );
    });
  });

  describe('uploadToS3 - URL source', () => {
    it('downloads through the destination guard, declaring the client unknown', async () => {
      safeFetchMock.mockResolvedValue(
        remoteResponse('downloaded-content', { 'content-type': 'image/jpeg' }),
      );

      const result = await service.uploadToS3('test-key', 'images', {
        type: 'url',
        url: 'https://example.com/image.jpg',
      });

      expect(safeFetchMock).toHaveBeenCalledWith(
        new URL('https://example.com/image.jpg'),
        expect.objectContaining({
          headers: {
            [UNATTRIBUTED_FORWARDED_HEADER]: UNATTRIBUTED_FORWARDED_VALUE,
          },
          redirect: 'error',
          signal: expect.any(AbortSignal),
        }),
        {},
      );
      expect(pipelineMock).toHaveBeenCalled();
      expect(fs.unlinkSync).toHaveBeenCalled();
      expect(result.publicUrl).toBe('https://s3.example.com/test-key');
    });

    it('trusts only the configured CDN origin to resolve privately', async () => {
      mockConfigService.get.mockImplementation((key: ConfigKey) =>
        key === 'GENFEEDAI_CDN_URL' ? 'http://localhost:3012' : undefined,
      );
      safeFetchMock.mockResolvedValue(
        remoteResponse('cdn-content', { 'content-type': 'image/jpeg' }),
      );

      await service.uploadToS3('test-key', 'images', {
        type: 'url',
        url: 'http://localhost:3012/ingredients/images/source',
      });

      expect(safeFetchMock).toHaveBeenCalledWith(
        expect.any(URL),
        expect.any(Object),
        {
          allowedOrigins: ['http://localhost:3012'],
          allowPrivateNetwork: true,
        },
      );
    });

    it.each([
      [
        true,
        { allowedOrigins: ['http://files:3012'], allowPrivateNetwork: true },
      ],
      [false, {}],
    ])(
      'trusts the files service origin only on self-hosted (self-hosted: %s)',
      async (isSelfHosted, policy) => {
        isSelfHostedDeploymentMock.mockReturnValue(isSelfHosted);
        mockConfigService.get.mockImplementation((key: ConfigKey) =>
          key === 'GENFEEDAI_MICROSERVICES_FILES_URL'
            ? 'http://files:3012'
            : 'https://cdn.example.com',
        );
        safeFetchMock.mockResolvedValue(
          remoteResponse('local-content', { 'content-type': 'image/jpeg' }),
        );

        await service.uploadToS3('test-key', 'images', {
          type: 'url',
          url: 'http://files:3012/local/ingredients/images/source',
        });

        expect(safeFetchMock).toHaveBeenCalledWith(
          expect.any(URL),
          expect.any(Object),
          policy,
        );
      },
    );

    it('rejects a destination the guard blocks with 400', async () => {
      safeFetchMock.mockRejectedValue(
        new DestinationGuardError(
          'Destination resolves to a private or reserved address: 169.254.169.254',
        ),
      );

      const status = await rejectionStatus(
        service.uploadToS3('test-key', 'images', {
          type: 'url',
          url: 'http://169.254.169.254/latest/meta-data/',
        }),
      );

      expect(status).toBe(HttpStatus.BAD_REQUEST);
      expect(pipelineMock).not.toHaveBeenCalled();
      expect(mockStorage.uploadFromFile).not.toHaveBeenCalled();
    });

    it('aborts the download when spool setup fails before piping', async () => {
      safeFetchMock.mockResolvedValue(
        remoteResponse('video-content', { 'content-type': 'video/mp4' }),
      );
      (fs.existsSync as Mock).mockReturnValue(false);
      (fs.mkdirSync as Mock).mockImplementationOnce(() => {
        throw new Error('EACCES');
      });

      const status = await rejectionStatus(
        service.uploadToS3('test-key', 'videos', {
          type: 'url',
          url: 'https://example.com/video.mp4',
        }),
      );

      const init = safeFetchMock.mock.calls[0]?.[1] as RequestInit;
      expect(status).toBe(HttpStatus.BAD_REQUEST);
      expect(init.signal?.aborted).toBe(true);
      expect(pipelineMock).not.toHaveBeenCalled();
    });

    it('should throw error for invalid URL', async () => {
      await expect(
        service.uploadToS3('test-key', 'images', {
          type: 'url',
          url: 'not-a-valid-url',
        }),
      ).rejects.toThrow(HttpException);
      expect(safeFetchMock).not.toHaveBeenCalled();
    });

    it('should throw error for empty URL', async () => {
      await expect(
        service.uploadToS3('test-key', 'images', {
          type: 'url',
          url: '',
        }),
      ).rejects.toThrow(HttpException);
    });

    it('should handle download errors', async () => {
      safeFetchMock.mockRejectedValue(new Error('Download failed'));

      await expect(
        service.uploadToS3('test-key', 'images', {
          type: 'url',
          url: 'https://example.com/image.jpg',
        }),
      ).rejects.toThrow('Failed to download file from URL: Download failed');
    });

    it('rejects a non-success response before spooling', async () => {
      safeFetchMock.mockResolvedValue(remoteResponse('missing', {}, 404));

      const status = await rejectionStatus(
        service.uploadToS3('test-key', 'images', {
          type: 'url',
          url: 'https://example.com/image.jpg',
        }),
      );

      expect(status).toBe(HttpStatus.BAD_REQUEST);
      expect(pipelineMock).not.toHaveBeenCalled();
    });

    it('rejects a declared size over the 200MB limit before spooling', async () => {
      safeFetchMock.mockResolvedValue(
        remoteResponse('large', {
          'content-length': String(200 * 1024 * 1024 + 1),
          'content-type': 'video/mp4',
        }),
      );

      await expect(
        service.uploadToS3('test-key', 'videos', {
          type: 'url',
          url: 'https://example.com/large-file.mp4',
        }),
      ).rejects.toThrow('File size exceeds 200MB limit');
      expect(pipelineMock).not.toHaveBeenCalled();
    });

    it('should infer content type from URL extension', async () => {
      safeFetchMock.mockResolvedValue(remoteResponse('video-content'));

      await service.uploadToS3('test-key', 'videos', {
        type: 'url',
        url: 'https://example.com/video.mp4',
      });

      // Video type should be detected from URL
      expect(mockFfmpegService.getVideoMetadata).toHaveBeenCalled();
    });

    it('keeps the response content type for a gif and extracts dimensions', async () => {
      safeFetchMock.mockResolvedValue(
        remoteResponse('gif-content', { 'content-type': 'image/gif' }),
      );

      const result = await service.uploadToS3('test-key', 'images', {
        type: 'url',
        url: 'https://example.com/animation.gif',
      });

      expect(result.width).toBe(1920);
      expect(result.height).toBe(1080);
      // Gif is uploaded as-is (re-encoding would flatten the animation).
      expect(mockStorage.uploadFromFile).toHaveBeenCalledWith(
        'ingredients/images/test-key',
        expect.stringContaining('.gif'),
        FILES_TMP_ROOT,
        'image/gif',
      );
      expect(mockStorage.uploadFromFile.mock.calls[0]?.[1]).not.toContain(
        'test-key',
      );
    });

    it('keeps the response content type for an extension-less webm URL', async () => {
      safeFetchMock.mockResolvedValue(
        remoteResponse('webm-content', { 'content-type': 'video/webm' }),
      );

      const result = await service.uploadToS3('test-key', 'videos', {
        type: 'url',
        url: 'https://example.com/clips/12345',
      });

      expect(mockFfmpegService.getVideoMetadata).toHaveBeenCalled();
      expect(result.duration).toBe(60);
      expect(result.hasAudio).toBe(true);
      expect(mockStorage.uploadFromFile).toHaveBeenCalledWith(
        'ingredients/videos/test-key',
        expect.any(String),
        FILES_TMP_ROOT,
        'video/webm',
      );
    });

    it('removes the spooled download when preparation fails', async () => {
      safeFetchMock.mockResolvedValue(
        remoteResponse('video-content', { 'content-type': 'video/mp4' }),
      );
      mockFfmpegService.getVideoMetadata.mockRejectedValue(
        new Error('ffprobe failed'),
      );

      await expect(
        service.uploadToS3('test-key', 'videos', {
          type: 'url',
          url: 'https://example.com/video.mp4',
        }),
      ).rejects.toThrow('ffprobe failed');

      expect(fs.unlinkSync).toHaveBeenCalledWith(
        expect.stringContaining('.mp4'),
      );
      expect((fs.unlinkSync as Mock).mock.calls[0]?.[0]).not.toContain(
        'test-key',
      );
      expect(mockStorage.uploadFromFile).not.toHaveBeenCalled();
    });

    it('should handle ZIP files from URL', async () => {
      safeFetchMock.mockResolvedValue(remoteResponse('zip-content'));

      const result = await service.uploadToS3('test-key', 'archives', {
        type: 'url',
        url: 'https://example.com/archive.zip',
      });

      expect(result.publicUrl).toBe('https://s3.example.com/test-key');
    });
  });

  describe('uploadToS3 - base64 source', () => {
    it('should upload base64 image', async () => {
      const base64Data = Buffer.from('test-image').toString('base64');

      const result = await service.uploadToS3('test-key', 'images', {
        contentType: 'image/jpeg',
        data: base64Data,
        type: 'base64',
      });

      expect(result.publicUrl).toBe('https://s3.example.com/test-key');
      expect(result.width).toBe(1920);
      expect(result.height).toBe(1080);
    });

    it('should strip data URL prefix from base64', async () => {
      const base64Data = `data:image/jpeg;base64,${Buffer.from('test').toString('base64')}`;

      await service.uploadToS3('test-key', 'images', {
        contentType: 'image/jpeg',
        data: base64Data,
        type: 'base64',
      });

      expect(mockStorage.upload).toHaveBeenCalled();
    });

    it('should handle base64 video and extract metadata', async () => {
      const base64Data = Buffer.from('video-content').toString('base64');

      const result = await service.uploadToS3('test-key', 'videos', {
        contentType: 'video/mp4',
        data: base64Data,
        type: 'base64',
      });

      expect(result.duration).toBe(60);
      expect(result.hasAudio).toBe(true);
    });
  });

  describe('uploadToS3 - buffer source', () => {
    it('should upload buffer directly', async () => {
      const buffer = Buffer.from('image-data');

      const result = await service.uploadToS3('test-key', 'images', {
        contentType: 'image/jpeg',
        data: buffer,
        type: 'buffer',
      });

      expect(result.publicUrl).toBe('https://s3.example.com/test-key');
    });

    it('should process image buffer', async () => {
      const buffer = Buffer.from('image-data');

      await service.uploadToS3('test-key', 'images', {
        contentType: 'image/jpeg',
        data: buffer,
        type: 'buffer',
      });

      expect(mockSharpInstance.rotate).toHaveBeenCalled();
      expect(mockSharpInstance.jpeg).toHaveBeenCalled();
    });

    it('should extract video metadata from buffer', async () => {
      const buffer = Buffer.from('video-data');

      const result = await service.uploadToS3('test-key', 'videos', {
        contentType: 'video/mp4',
        data: buffer,
        type: 'buffer',
      });

      expect(result.width).toBe(1920);
      expect(result.height).toBe(1080);
    });
  });

  describe('uploadToS3 - error handling', () => {
    it('should throw error for invalid source type', async () => {
      await expect(
        service.uploadToS3('test-key', 'files', {
          type: 'invalid' as never,
        }),
      ).rejects.toThrow('Invalid upload source type');
    });

    it('should log error details on failure', async () => {
      mockStorage.upload.mockRejectedValue(new Error('S3 error'));

      await expect(
        service.uploadToS3('test-key', 'images', {
          path: path.join(FILES_TMP_ROOT, 'fixtures', 'image.jpg'),
          type: 'file',
        }),
      ).rejects.toThrow('S3 error');

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('upload failed'),
        expect.objectContaining({
          key: 'test-key',
          type: 'images',
        }),
      );
    });
  });

  describe('uploadToS3 - image processing', () => {
    it('should auto-rotate images based on EXIF', async () => {
      await service.uploadToS3('test-key', 'images', {
        path: path.join(FILES_TMP_ROOT, 'fixtures', 'image.jpg'),
        type: 'file',
      });

      expect(mockSharpInstance.rotate).toHaveBeenCalled();
    });

    it('should use configured compression quality', async () => {
      mockConfigService.get.mockReturnValue('85');

      await service.uploadToS3('test-key', 'images', {
        path: path.join(FILES_TMP_ROOT, 'fixtures', 'image.jpg'),
        type: 'file',
      });

      expect(mockSharpInstance.jpeg).toHaveBeenCalledWith({ quality: 85 });
    });

    it('should use default admin quality if not configured', async () => {
      mockConfigService.get.mockReturnValue(undefined);

      await service.uploadToS3('test-key', 'images', {
        path: path.join(FILES_TMP_ROOT, 'fixtures', 'image.jpg'),
        type: 'file',
      });

      expect(mockSharpInstance.jpeg).toHaveBeenCalledWith({ quality: 50 });
    });
  });

  describe('uploadToS3 - logging', () => {
    it('should log upload start', async () => {
      await service.uploadToS3('test-key', 'images', {
        path: path.join(FILES_TMP_ROOT, 'fixtures', 'image.jpg'),
        type: 'file',
      });

      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('starting upload'),
        expect.objectContaining({
          key: 'test-key',
          sourceType: 'file',
          type: 'images',
        }),
      );
    });

    it('should log upload completion with metrics', async () => {
      await service.uploadToS3('test-key', 'images', {
        path: path.join(FILES_TMP_ROOT, 'fixtures', 'image.jpg'),
        type: 'file',
      });

      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('upload completed successfully'),
        expect.objectContaining({
          key: 'test-key',
          publicUrl: 'https://s3.example.com/test-key',
        }),
      );
    });
  });

  describe('uploadToS3 - return values', () => {
    it('should return complete metadata for images', async () => {
      const result = await service.uploadToS3('test-key', 'images', {
        path: path.join(FILES_TMP_ROOT, 'fixtures', 'image.jpg'),
        type: 'file',
      });

      expect(result).toEqual(
        expect.objectContaining({
          height: expect.any(Number),
          publicUrl: expect.any(String),
          size: expect.any(Number),
          width: expect.any(Number),
        }),
      );
    });

    it('should return complete metadata for videos', async () => {
      const result = await service.uploadToS3('test-key', 'videos', {
        path: path.join(FILES_TMP_ROOT, 'fixtures', 'video.mp4'),
        type: 'file',
      });

      expect(result).toEqual(
        expect.objectContaining({
          duration: expect.any(Number),
          hasAudio: expect.any(Boolean),
          height: expect.any(Number),
          publicUrl: expect.any(String),
          size: expect.any(Number),
          width: expect.any(Number),
        }),
      );
    });
  });
});
