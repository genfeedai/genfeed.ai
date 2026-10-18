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

const pipelineMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock('node:stream/promises', () => ({
  pipeline: pipelineMock,
}));

vi.mock('fs', () => ({
  createReadStream: vi.fn(),
  createWriteStream: vi.fn(),
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  promises: { unlink: vi.fn().mockResolvedValue(undefined) },
  writeFileSync: vi.fn(),
}));

import * as fs from 'node:fs';
import { Readable } from 'node:stream';
import { PutObjectCommand } from '@aws-sdk/client-s3';
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
    it('pipelines the object body to disk without concatenating chunks', async () => {
      const body = Readable.from([
        Buffer.from('chunk-1'),
        Buffer.from('chunk-2'),
      ]);
      s3SendMock.mockResolvedValue({
        Body: body,
      });
      (fs.existsSync as Mock).mockReturnValue(false);
      (fs.createWriteStream as Mock).mockReturnValue({ path: 'dest' });

      await service.downloadFile('videos/input.mp4', 'videos/input.mp4');

      expect(fs.mkdirSync).toHaveBeenCalled();
      expect(fs.createWriteStream).toHaveBeenCalledWith(
        expect.stringContaining('videos/input.mp4'),
      );
      expect(pipelineMock).toHaveBeenCalledWith(body, expect.anything());
      expect(fs.writeFileSync).not.toHaveBeenCalled();
    });

    it('logs and rethrows when S3 send fails', async () => {
      s3SendMock.mockRejectedValue(new Error('object missing'));

      await expect(
        service.downloadFile('videos/input.mp4', 'videos/input.mp4'),
      ).rejects.toThrow('object missing');
    });
  });

  describe('downloadFromUrl', () => {
    it('pipelines the remote body to disk without buffering it', async () => {
      const body = Readable.from(Buffer.from('remote-data'));
      safeFetchMock.mockResolvedValue({
        body,
        ok: true,
      });
      (fs.existsSync as Mock).mockReturnValue(false);
      (fs.createWriteStream as Mock).mockReturnValue({ path: 'dest' });

      await service.downloadFromUrl(
        'https://example.com/file.mp4',
        'videos/downloaded.mp4',
      );

      expect(fs.mkdirSync).toHaveBeenCalled();
      expect(pipelineMock).toHaveBeenCalledWith(body, expect.anything());
      expect(fs.writeFileSync).not.toHaveBeenCalled();
    });

    it('rejects a declared oversized materialization before writing', async () => {
      const body = Readable.from(Buffer.from('oversized'));
      safeFetchMock.mockResolvedValue({
        body,
        headers: new Headers({ 'content-length': '11' }),
        ok: true,
      });
      await expect(
        service.downloadFromUrl(
          'https://example.com/source.mp4',
          'videos/source.mp4',
          10,
        ),
      ).rejects.toThrow(/size limit/);
      expect(body.destroyed).toBe(true);
      expect(pipelineMock).not.toHaveBeenCalled();
      expect(safeFetchMock).toHaveBeenCalledWith(
        'https://example.com/source.mp4',
        { signal: expect.any(AbortSignal) },
      );
    });

    it.each([undefined, '1'])(
      'caps actual streamed bytes with content-length %s and cleans partial output',
      async (length) => {
        const body = Readable.from([Buffer.from('abc'), Buffer.from('def')]);
        safeFetchMock.mockResolvedValue({
          body,
          headers: new Headers(length ? { 'content-length': length } : {}),
          ok: true,
        });
        const { pipeline } = await vi.importActual<
          typeof import('node:stream/promises')
        >('node:stream/promises');
        const { Writable } = await import('node:stream');
        (fs.createWriteStream as Mock).mockImplementation(
          () =>
            new Writable({
              write(_chunk, _encoding, callback) {
                callback();
              },
            }),
        );
        const unlink = vi
          .spyOn(fs.promises, 'unlink')
          .mockResolvedValue(undefined);
        pipelineMock.mockImplementationOnce(pipeline);
        try {
          await expect(
            service.downloadFromUrl(
              'https://example.com/source.mp4',
              'videos/source.mp4',
              5,
            ),
          ).rejects.toThrow(/size limit/);
          expect(body.destroyed).toBe(true);
          expect(unlink).toHaveBeenCalledWith(
            expect.stringContaining('videos/source.mp4'),
          );
        } finally {
          unlink.mockRestore();
        }
      },
    );

    it('accepts exactly the streamed limit', async () => {
      const body = Readable.from([Buffer.from('abc'), Buffer.from('de')]);
      safeFetchMock.mockResolvedValue({
        body,
        headers: new Headers(),
        ok: true,
      });
      const { pipeline } = await vi.importActual<
        typeof import('node:stream/promises')
      >('node:stream/promises');
      const { Writable } = await import('node:stream');
      const chunks: Buffer[] = [];
      (fs.createWriteStream as Mock).mockImplementation(
        () =>
          new Writable({
            write(chunk: Buffer, _encoding, callback) {
              chunks.push(chunk);
              callback();
            },
          }),
      );
      pipelineMock.mockImplementationOnce(pipeline);
      await service.downloadFromUrl(
        'https://example.com/source.mp4',
        'videos/source.mp4',
        5,
      );
      expect(Buffer.concat(chunks).toString()).toBe('abcde');
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
      safeFetchMock.mockResolvedValue(
        new Response(JSON.stringify({ message: 'missing object' }), {
          status: 404,
          statusText: 'Not Found',
        }),
      );

      await expect(
        service.downloadFromUrl(
          'https://example.com/missing.mp4',
          'videos/missing.mp4',
        ),
      ).rejects.toThrow('missing object');
    });

    it('falls back to raw text when the error body is not JSON', async () => {
      safeFetchMock.mockResolvedValue(
        new Response('plain text error', {
          status: 500,
          statusText: 'Server Error',
        }),
      );

      await expect(
        service.downloadFromUrl(
          'https://example.com/broken.mp4',
          'videos/broken.mp4',
        ),
      ).rejects.toThrow('plain text error');
    });

    it.each([undefined, '1', '65536'])(
      'discards oversized error bytes with content-length %s and releases the body',
      async (length) => {
        const cancel = vi.fn();
        let source: ReadableStreamDefaultController<Uint8Array> | undefined;
        const response = new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              source = controller;
              controller.enqueue(new Uint8Array(65_537).fill(120));
            },
            cancel,
          }),
          {
            headers: length ? { 'content-length': length } : {},
            status: 500,
            statusText: 'Server Error',
          },
        );
        safeFetchMock.mockResolvedValue(response);
        const outcome = service
          .downloadFromUrl(
            'https://example.com/broken.mp4',
            'videos/broken.mp4',
          )
          .catch((error: unknown) => error);
        try {
          for (let turn = 0; turn < 20; turn++) await Promise.resolve();
          expect(cancel).toHaveBeenCalledOnce();
          expect(response.body?.locked).toBe(false);
        } finally {
          // Also settle the old unbounded implementation during the RED run.
          if (!cancel.mock.calls.length) source?.close();
          await outcome;
        }
        expect(await outcome).toEqual(
          new Error(
            'Failed to download from https://example.com/broken.mp4: 500 Server Error - Server Error',
          ),
        );
        expect(pipelineMock).not.toHaveBeenCalled();
        expect(fs.createWriteStream).not.toHaveBeenCalled();
      },
    );

    it('accepts exactly 64 KiB of complete error text and releases its reader', async () => {
      const text = 'a'.repeat(65_536);
      const response = new Response(text, { status: 500 });
      safeFetchMock.mockResolvedValue(response);
      await expect(
        service.downloadFromUrl(
          'https://example.com/broken.mp4',
          'videos/broken.mp4',
        ),
      ).rejects.toThrow(` - ${text}`);
      expect(response.body?.locked).toBe(false);
    });

    it.each([false, true])(
      'bounds an unfinished error body with one absolute deadline (progress=%s)',
      async (progress) => {
        vi.useFakeTimers();
        let source: ReadableStreamDefaultController<Uint8Array> | undefined;
        const cancel = vi.fn();
        const response = new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              source = controller;
            },
            cancel,
          }),
          { status: 503, statusText: 'Unavailable' },
        );
        safeFetchMock.mockResolvedValue(response);
        let settled: unknown;
        const outcome = service
          .downloadFromUrl(
            'https://example.com/broken.mp4',
            'videos/broken.mp4',
          )
          .catch((error: unknown) => {
            settled = error;
            return error;
          });
        try {
          await vi.advanceTimersByTimeAsync(0);
          await vi.advanceTimersByTimeAsync(9_999);
          expect(settled).toBeUndefined();
          if (progress) source?.enqueue(new TextEncoder().encode('partial'));
          await vi.advanceTimersByTimeAsync(1);
          expect(settled).toEqual(
            new Error(
              'Failed to download from https://example.com/broken.mp4: 503 Unavailable - Unavailable',
            ),
          );
          expect(cancel).toHaveBeenCalledOnce();
          expect(response.body?.locked).toBe(false);
          expect(vi.getTimerCount()).toBe(0);
          expect(pipelineMock).not.toHaveBeenCalled();
          expect(fs.createWriteStream).not.toHaveBeenCalled();
        } finally {
          if (!cancel.mock.calls.length) source?.close();
          await outcome;
          vi.useRealTimers();
        }
      },
    );

    it.each(['reject', 'pending'])(
      'does not wait for or expose %s cancellation after an oversized error',
      async (cancellation) => {
        let source: ReadableStreamDefaultController<Uint8Array> | undefined;
        const cancel = vi.fn(() =>
          cancellation === 'reject'
            ? Promise.reject(new Error('private cancellation failure'))
            : new Promise<void>(() => undefined),
        );
        const response = new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              source = controller;
              controller.enqueue(new Uint8Array(65_537).fill(120));
            },
            cancel,
          }),
          { status: 500, statusText: 'Server Error' },
        );
        safeFetchMock.mockResolvedValue(response);
        let settled: unknown;
        const outcome = service
          .downloadFromUrl(
            'https://example.com/broken.mp4',
            'videos/broken.mp4',
          )
          .catch((error: unknown) => {
            settled = error;
            return error;
          });
        try {
          for (let turn = 0; turn < 20; turn++) await Promise.resolve();
          expect(cancel).toHaveBeenCalledOnce();
          expect(settled).toEqual(
            new Error(
              'Failed to download from https://example.com/broken.mp4: 500 Server Error - Server Error',
            ),
          );
          expect(response.body?.locked).toBe(false);
        } finally {
          if (!cancel.mock.calls.length) source?.close();
          await outcome;
        }
      },
    );

    it('counts UTF-8 bytes rather than characters before retaining an error body', async () => {
      const response = new Response('é'.repeat(32_769), {
        status: 500,
        statusText: 'Server Error',
      });
      safeFetchMock.mockResolvedValue(response);
      const error = await service
        .downloadFromUrl('https://example.com/broken.mp4', 'videos/broken.mp4')
        .catch((error: unknown) => error);
      expect(error).toEqual(
        new Error(
          'Failed to download from https://example.com/broken.mp4: 500 Server Error - Server Error',
        ),
      );
      expect(response.body?.locked).toBe(false);
    });

    it('preserves split UTF-8 JSON detail and its precedence over message', async () => {
      const bytes = new TextEncoder().encode(
        JSON.stringify({
          errors: [{ detail: 'missing café ☕' }],
          message: 'fallback',
        }),
      );
      const response = new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
            controller.close();
          },
        }),
        { status: 404 },
      );
      safeFetchMock.mockResolvedValue(response);
      await expect(
        service.downloadFromUrl(
          'https://example.com/broken.mp4',
          'videos/broken.mp4',
        ),
      ).rejects.toThrow('missing café ☕');
      expect(response.body?.locked).toBe(false);
    });

    it.each([null, ''])(
      'preserves a complete empty error body %s',
      async (body) => {
        const response = new Response(body, { status: 500 });
        safeFetchMock.mockResolvedValue(response);
        const error = await service
          .downloadFromUrl(
            'https://example.com/broken.mp4',
            'videos/broken.mp4',
          )
          .catch((error: unknown) => error);
        expect(error).toEqual(
          new Error(
            'Failed to download from https://example.com/broken.mp4: 500  - ',
          ),
        );
        expect(response.body?.locked ?? false).toBe(false);
      },
    );

    it('uses the HTTP status when reading the error body fails', async () => {
      const response = new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.error(new Error('private upstream failure'));
          },
        }),
        { status: 503, statusText: 'Unavailable' },
      );
      safeFetchMock.mockResolvedValue(response);
      await expect(
        service.downloadFromUrl(
          'https://example.com/broken.mp4',
          'videos/broken.mp4',
        ),
      ).rejects.toThrow('503 Unavailable - Unavailable');
      expect(response.body?.locked).toBe(false);
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

    it('signs the declared content length into the upload command', async () => {
      (getSignedUrl as Mock).mockResolvedValue('https://s3/presigned');

      await service.getPresignedUploadUrl(
        'videos/new.mp4',
        'video/mp4',
        3600,
        2048,
      );

      expect(PutObjectCommand).toHaveBeenLastCalledWith(
        expect.objectContaining({
          ContentLength: 2048,
          ContentType: 'video/mp4',
        }),
      );
    });

    it('signs the content-type header so the allowlist binds the PUT', async () => {
      (getSignedUrl as Mock).mockResolvedValue('https://s3/presigned');

      await service.getPresignedUploadUrl('videos/new.mp4', 'video/mp4');

      expect(getSignedUrl).toHaveBeenLastCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({
          signableHeaders: new Set(['content-type']),
        }),
      );
    });

    it('omits the content length when none is declared', async () => {
      (getSignedUrl as Mock).mockResolvedValue('https://s3/presigned');

      await service.getPresignedUploadUrl('videos/new.mp4', 'video/mp4');

      const input = (PutObjectCommand as unknown as Mock).mock.lastCall?.[0];
      expect(input).not.toHaveProperty('ContentLength');
    });

    it('logs and rethrows when signing fails', async () => {
      (getSignedUrl as Mock).mockRejectedValue(new Error('signing failed'));

      await expect(
        service.getPresignedUploadUrl('videos/new.mp4'),
      ).rejects.toThrow('signing failed');
    });
  });

  describe('exact stored-key download signing', () => {
    it('passes raw reserved bytes unchanged to the SDK command', async () => {
      vi.mocked(getSignedUrl).mockResolvedValue('https://signed.test');
      const key = 'ingredients/images/ space ?#%2F.png ';
      await service.getPresignedDownloadUrlForStoredKey(key);
      expect(getSignedUrl).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ input: { Bucket: 'test-bucket', Key: key } }),
        { expiresIn: 300 },
      );
    });
    it.each([
      '../secret',
      'images/../secret',
      '/images/x',
      'images//x',
      'images/\\x',
      'images/\u0000x',
      'https://attacker.test/x',
    ])('rejects structural key attacks %s', async (key) => {
      await expect(
        service.getPresignedDownloadUrlForStoredKey(key),
      ).rejects.toThrow('Invalid stored object key');
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
