import { Readable } from 'node:stream';
import { FileInputType } from '@genfeedai/enums';
import type { ConfigService } from '@libs/config/config.service';
import type { LoggerService } from '@libs/logger/logger.service';
import type { HttpService } from '@nestjs/axios';
import FormData from 'form-data';
import { of, throwError } from 'rxjs';

const isSelfHostedDeployment = vi.fn(() => false);

vi.mock('@genfeedai/config', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  isSelfHostedDeployment,
}));

const { FilesClientService } = await import('./files-client.service');

const BASE = 'https://files.test';

function createHarness(filesUrl: string | null = BASE) {
  const configService = {
    get: vi.fn((key: string) =>
      key === 'GENFEEDAI_MICROSERVICES_FILES_URL' ? filesUrl : undefined,
    ),
  } as unknown as ConfigService;
  const loggerService = {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  } as unknown as LoggerService;
  const get = vi.fn();
  const post = vi.fn();
  const put = vi.fn();
  const httpService = { get, post, put } as unknown as HttpService;

  return {
    get,
    loggerService,
    post,
    put,
    service: new FilesClientService(httpService, configService, loggerService),
  };
}

describe('FilesClientService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isSelfHostedDeployment.mockReturnValue(false);
  });

  it('falls back to the local files service when no url is configured', async () => {
    const { post, service } = createHarness(null);
    post.mockReturnValue(of({ data: { data: '' } }));

    await service.resizeImage(Buffer.from('x'), { height: 1, width: 1 });

    expect(post).toHaveBeenCalledWith(
      'http://localhost:3012/v1/files/processing/resize-image',
      expect.anything(),
    );
  });

  describe('resizeImage', () => {
    it('sends the image as base64 and decodes the response', async () => {
      const { post, service } = createHarness();
      post.mockReturnValue(
        of({ data: { data: Buffer.from('resized').toString('base64') } }),
      );

      await expect(
        service.resizeImage(Buffer.from('original'), {
          height: 200,
          width: 100,
        }),
      ).resolves.toEqual(Buffer.from('resized'));

      expect(post).toHaveBeenCalledWith(
        `${BASE}/v1/files/processing/resize-image`,
        {
          height: 200,
          imageData: Buffer.from('original').toString('base64'),
          width: 100,
        },
      );
    });

    it('logs and rethrows a transport failure', async () => {
      const { loggerService, post, service } = createHarness();
      post.mockReturnValue(throwError(() => new Error('502')));

      await expect(
        service.resizeImage(Buffer.from('x'), { height: 1, width: 1 }),
      ).rejects.toThrowError('502');
      expect(loggerService.error).toHaveBeenCalledWith(
        'Failed to resize image',
        expect.any(Error),
      );
    });
  });

  describe('resizeImageFromUrl', () => {
    it('sends the source url instead of bytes', async () => {
      const { post, service } = createHarness();
      post.mockReturnValue(
        of({ data: { data: Buffer.from('resized').toString('base64') } }),
      );

      await expect(
        service.resizeImageFromUrl('https://cdn.test/a.png', {
          height: 200,
          width: 100,
        }),
      ).resolves.toEqual(Buffer.from('resized'));

      expect(post).toHaveBeenCalledWith(
        `${BASE}/v1/files/processing/resize-image`,
        { height: 200, imageUrl: 'https://cdn.test/a.png', width: 100 },
      );
    });

    it('logs and rethrows a transport failure', async () => {
      const { loggerService, post, service } = createHarness();
      post.mockReturnValue(throwError(() => new Error('502')));

      await expect(
        service.resizeImageFromUrl('https://cdn.test/a.png', {
          height: 1,
          width: 1,
        }),
      ).rejects.toThrowError('502');
      expect(loggerService.error).toHaveBeenCalledWith(
        'Failed to resize image from URL',
        expect.any(Error),
      );
    });
  });

  describe('extractMetadataFromUrl', () => {
    it('reads dimensions from the video stream and flags audio presence', async () => {
      const { post, service } = createHarness();
      post.mockReturnValue(
        of({
          data: {
            format: { duration: '12.5', size: 4096 },
            streams: [
              { codec_type: 'video', height: 1920, width: 1080 },
              { codec_type: 'audio' },
            ],
          },
        }),
      );

      await expect(
        service.extractMetadataFromUrl('https://cdn.test/a.mp4'),
      ).resolves.toEqual({
        duration: 12.5,
        hasAudio: true,
        height: 1920,
        size: 4096,
        width: 1080,
      });
    });

    it('zeroes every field when the probe returns nothing usable', async () => {
      const { post, service } = createHarness();
      post.mockReturnValue(of({ data: {} }));

      await expect(
        service.extractMetadataFromUrl('https://cdn.test/a.mp4'),
      ).resolves.toEqual({
        duration: 0,
        hasAudio: false,
        height: 0,
        size: 0,
        width: 0,
      });
    });

    it('treats an unparseable duration as zero', async () => {
      const { post, service } = createHarness();
      post.mockReturnValue(
        of({ data: { format: { duration: 'N/A' }, streams: [] } }),
      );

      await expect(
        service.extractMetadataFromUrl('https://cdn.test/a.mp4'),
      ).resolves.toMatchObject({ duration: 0 });
    });

    it('logs and rethrows a transport failure', async () => {
      const { loggerService, post, service } = createHarness();
      post.mockReturnValue(throwError(() => new Error('502')));

      await expect(
        service.extractMetadataFromUrl('https://cdn.test/a.mp4'),
      ).rejects.toThrowError('502');
      expect(loggerService.error).toHaveBeenCalledWith(
        'Failed to extract metadata from URL',
        expect.any(Error),
      );
    });
  });

  describe('generateThumbnail', () => {
    it('forwards every framing parameter', async () => {
      const { post, service } = createHarness();
      post.mockReturnValue(of({ data: { publicUrl: 'https://cdn/t.jpg' } }));

      await expect(
        service.generateThumbnail('https://cdn/a.mp4', 'ing-1', 3, 640),
      ).resolves.toEqual({ publicUrl: 'https://cdn/t.jpg' });

      expect(post).toHaveBeenCalledWith(
        `${BASE}/v1/files/processing/generate-thumbnail`,
        {
          ingredientId: 'ing-1',
          timeInSeconds: 3,
          videoUrl: 'https://cdn/a.mp4',
          width: 640,
        },
      );
    });

    it('logs and rethrows a transport failure', async () => {
      const { loggerService, post, service } = createHarness();
      post.mockReturnValue(throwError(() => new Error('502')));

      await expect(
        service.generateThumbnail('https://cdn/a.mp4', 'ing-1'),
      ).rejects.toThrowError('502');
      expect(loggerService.error).toHaveBeenCalledWith(
        'Failed to generate thumbnail',
        expect.any(Error),
      );
    });
  });

  describe('audioOverlay', () => {
    it('passes the overlay parameters through verbatim', async () => {
      const { post, service } = createHarness();
      post.mockReturnValue(
        of({ data: { publicUrl: 'https://cdn/o.mp4', s3Key: 'k' } }),
      );
      const params = {
        audioUrl: 'https://cdn/a.mp3',
        mixMode: 'mix' as const,
        videoUrl: 'https://cdn/v.mp4',
      };

      await expect(service.audioOverlay(params)).resolves.toEqual({
        publicUrl: 'https://cdn/o.mp4',
        s3Key: 'k',
      });
      expect(post).toHaveBeenCalledWith(
        `${BASE}/v1/files/processing/audio-overlay`,
        params,
      );
    });

    it('logs and rethrows a transport failure', async () => {
      const { loggerService, post, service } = createHarness();
      post.mockReturnValue(throwError(() => new Error('502')));

      await expect(
        service.audioOverlay({
          audioUrl: 'https://cdn/a.mp3',
          videoUrl: 'https://cdn/v.mp4',
        }),
      ).rejects.toThrowError('502');
      expect(loggerService.error).toHaveBeenCalledWith(
        'Failed to overlay audio',
        expect.any(Error),
      );
    });
  });

  describe('inspectVideoQa', () => {
    it('forwards inspection parameters to the files processing endpoint', async () => {
      const { post, service } = createHarness();
      const payload = {
        contactSheetUrl: null,
        decodeOk: true,
        detectLog: '',
        loudnessLog: 'I: -16.0 LUFS',
        probeJson: '{}',
      };
      post.mockReturnValue(of({ data: payload }));
      const params = {
        blackDurationSeconds: 0.5,
        freezeDurationSeconds: 2,
        isContactSheetEnabled: false,
        videoUrl: 'https://cdn/v.mp4',
      };

      await expect(service.inspectVideoQa(params)).resolves.toEqual(payload);
      expect(post).toHaveBeenCalledWith(
        `${BASE}/v1/files/processing/video-qa`,
        params,
      );
    });
  });

  describe('uploadToS3', () => {
    it('sends a buffer source as multipart, not base64 JSON', async () => {
      const { post, service } = createHarness();
      post.mockReturnValue(of({ data: { publicUrl: 'https://cdn/a.mp3' } }));

      await expect(
        service.uploadToS3('key-1', 'musics', {
          contentType: 'audio/mpeg',
          data: Buffer.from('bytes'),
          type: FileInputType.BUFFER,
        }),
      ).resolves.toEqual({ publicUrl: 'https://cdn/a.mp3' });

      expect(post).toHaveBeenCalledWith(
        `${BASE}/v1/files/upload/multipart`,
        expect.any(FormData),
        expect.objectContaining({
          headers: expect.any(Object),
          maxBodyLength: Number.POSITIVE_INFINITY,
        }),
      );
      expect(post.mock.calls[0]?.[1]).toBeInstanceOf(FormData);
      expect(post.mock.calls[0]?.[0]).not.toBe(`${BASE}/v1/files/upload`);
    });

    it('streams a readable to the multipart upload route', async () => {
      const { post, service } = createHarness();
      post.mockReturnValue(of({ data: { publicUrl: 'https://cdn/a.mp4' } }));
      const stream = Readable.from(Buffer.from('video-bytes'));

      await expect(
        service.uploadStreamToS3('key-1', 'videos', {
          contentType: 'video/mp4',
          data: stream,
          filename: 'clip.mp4',
        }),
      ).resolves.toEqual({ publicUrl: 'https://cdn/a.mp4' });

      expect(post).toHaveBeenCalledWith(
        `${BASE}/v1/files/upload/multipart`,
        expect.any(FormData),
        expect.any(Object),
      );
    });

    it('puts a stream at a presigned URL', async () => {
      const { put, service } = createHarness();
      put.mockReturnValue(of({ data: {} }));
      const body = Buffer.from('object-bytes');

      await service.putStreamToUrl(
        'https://s3.test/presigned',
        body,
        'video/mp4',
      );

      expect(put).toHaveBeenCalledWith(
        'https://s3.test/presigned',
        body,
        expect.objectContaining({
          headers: { 'Content-Type': 'video/mp4' },
        }),
      );
    });

    it('logs and rethrows when the presigned put fails', async () => {
      const { loggerService, put, service } = createHarness();
      put.mockReturnValue(throwError(() => new Error('403')));

      await expect(
        service.putStreamToUrl(
          'https://s3.test/presigned',
          Buffer.from('x'),
          'video/mp4',
        ),
      ).rejects.toThrowError('403');
      expect(loggerService.error).toHaveBeenCalledWith(
        'Failed to upload stream to presigned URL',
        expect.any(Error),
      );
    });

    it('passes a non-buffer source through unchanged', async () => {
      const { post, service } = createHarness();
      post.mockReturnValue(of({ data: {} }));
      const source = {
        type: FileInputType.URL,
        url: 'https://cdn/a.mp3',
      } as never;

      await service.uploadToS3('key-1', 'musics', source);

      expect(post).toHaveBeenCalledWith(
        `${BASE}/v1/files/upload`,
        expect.objectContaining({ source }),
      );
    });

    it('logs and rethrows a transport failure', async () => {
      const { loggerService, post, service } = createHarness();
      post.mockReturnValue(throwError(() => new Error('502')));

      await expect(
        service.uploadToS3('key-1', 'musics', {
          contentType: 'audio/mpeg',
          data: Buffer.from('x'),
          type: FileInputType.BUFFER,
        }),
      ).rejects.toThrowError('502');
      expect(loggerService.error).toHaveBeenCalledWith(
        'Failed to upload file to S3',
        expect.any(Error),
      );
    });
  });

  describe('getFileFromS3', () => {
    it('requests the download route as a stream', async () => {
      const { get, service } = createHarness();
      get.mockReturnValue(of({ data: 'stream-handle' }));

      await expect(service.getFileFromS3('key-1', 'musics')).resolves.toBe(
        'stream-handle',
      );
      expect(get).toHaveBeenCalledWith(
        `${BASE}/v1/files/download/musics/key-1`,
        { responseType: 'stream' },
      );
    });

    it('logs the key, type and status before rethrowing', async () => {
      const { get, loggerService, service } = createHarness();
      get.mockReturnValue(
        throwError(() => Object.assign(new Error('gone'), { status: 404 })),
      );

      await expect(
        service.getFileFromS3('key-1', 'musics'),
      ).rejects.toThrowError('gone');
      expect(loggerService.error).toHaveBeenCalledWith(
        'Failed to download file from S3',
        { error: 'gone', key: 'key-1', statusCode: 404, type: 'musics' },
      );
    });

    it('reports an unknown error for a non-Error rejection', async () => {
      const { get, loggerService, service } = createHarness();
      get.mockReturnValue(throwError(() => ({})));

      await expect(service.getFileFromS3('key-1', 'musics')).rejects.toEqual(
        {},
      );
      expect(loggerService.error).toHaveBeenCalledWith(
        'Failed to download file from S3',
        expect.objectContaining({ error: 'Unknown error' }),
      );
    });
  });

  describe('getPresignedUploadUrl', () => {
    it('returns a direct local upload target in self-hosted mode', async () => {
      const { post, service } = createHarness();
      isSelfHostedDeployment.mockReturnValue(true);

      await expect(
        service.getPresignedUploadUrl('key-1', 'musics'),
      ).resolves.toEqual({
        publicUrl: '/local/ingredients/musics/key-1',
        s3Key: 'ingredients/musics/key-1',
        uploadMethod: 'POST_JSON',
        uploadUrl: `${BASE}/v1/files/upload`,
      });
      expect(post).not.toHaveBeenCalled();
    });

    it('requests a presigned PUT target in cloud mode', async () => {
      const { post, service } = createHarness();
      post.mockReturnValue(
        of({
          data: {
            key: 's3/key-1',
            publicUrl: 'https://cdn/key-1',
            uploadUrl: 'https://s3/put',
          },
        }),
      );

      await expect(
        service.getPresignedUploadUrl('key-1', 'musics', 'audio/mpeg'),
      ).resolves.toEqual({
        publicUrl: 'https://cdn/key-1',
        s3Key: 's3/key-1',
        uploadMethod: 'PUT',
        uploadUrl: 'https://s3/put',
      });
      expect(post).toHaveBeenCalledWith(`${BASE}/v1/files/presigned-upload`, {
        contentType: 'audio/mpeg',
        filename: 'key-1',
        type: 'musics',
      });
    });

    it('defaults the content type to an opaque octet stream', async () => {
      const { post, service } = createHarness();
      post.mockReturnValue(of({ data: {} }));

      await service.getPresignedUploadUrl('key-1', 'musics');

      expect(post).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ contentType: 'application/octet-stream' }),
      );
    });

    it('logs and rethrows a transport failure', async () => {
      const { loggerService, post, service } = createHarness();
      post.mockReturnValue(throwError(() => new Error('502')));

      await expect(
        service.getPresignedUploadUrl('key-1', 'musics'),
      ).rejects.toThrowError('502');
      expect(loggerService.error).toHaveBeenCalledWith(
        'Failed to get presigned upload URL',
        expect.any(Error),
      );
    });
  });

  describe('getPresignedDownloadUrl', () => {
    it('returns the download url from the files service', async () => {
      const { get, service } = createHarness();
      get.mockReturnValue(of({ data: { downloadUrl: 'https://s3/get' } }));

      await expect(
        service.getPresignedDownloadUrl('key-1', 'musics'),
      ).resolves.toBe('https://s3/get');
      expect(get).toHaveBeenCalledWith(
        `${BASE}/v1/files/presigned-download/musics/key-1`,
      );
    });

    it('logs and rethrows a transport failure', async () => {
      const { get, loggerService, service } = createHarness();
      get.mockReturnValue(throwError(() => new Error('502')));

      await expect(
        service.getPresignedDownloadUrl('key-1', 'musics'),
      ).rejects.toThrowError('502');
      expect(loggerService.error).toHaveBeenCalledWith(
        'Failed to get presigned download URL',
        expect.any(Error),
      );
    });
  });

  describe('copyInS3', () => {
    it('posts both keys and their types', async () => {
      const { post, service } = createHarness();
      post.mockReturnValue(of({ data: {} }));

      await expect(
        service.copyInS3('src', 'dst', 'musics', 'videos'),
      ).resolves.toBeUndefined();
      expect(post).toHaveBeenCalledWith(`${BASE}/v1/files/copy`, {
        destinationKey: 'dst',
        destinationType: 'videos',
        sourceKey: 'src',
        sourceType: 'musics',
      });
    });

    it('logs the parsed error detail before rethrowing', async () => {
      const { loggerService, post, service } = createHarness();
      const failure = Object.assign(new Error('access denied'), {
        code: 'AccessDenied',
        response: { status: 403 },
      });
      post.mockReturnValue(throwError(() => failure));

      await expect(service.copyInS3('src', 'dst')).rejects.toThrowError(
        failure,
      );
      expect(loggerService.error).toHaveBeenCalledWith(
        'Failed to copy file in S3',
        expect.objectContaining({
          code: 'AccessDenied',
          destinationKey: 'dst',
          message: 'access denied',
          sourceKey: 'src',
          statusCode: 403,
        }),
      );
    });

    it('falls back to a top-level statusCode and an unknown message', async () => {
      const { loggerService, post, service } = createHarness();
      post.mockReturnValue(throwError(() => ({ statusCode: 500 })));

      await expect(service.copyInS3('src', 'dst')).rejects.toEqual({
        statusCode: 500,
      });
      expect(loggerService.error).toHaveBeenCalledWith(
        'Failed to copy file in S3',
        expect.objectContaining({
          message: 'Unknown error',
          statusCode: 500,
        }),
      );
    });
  });

  describe('deleteStoredObject', () => {
    it('deletes one full storage key through the files service', async () => {
      const { post, service } = createHarness();
      post.mockReturnValue(of({ data: { deleted: true } }));

      await expect(
        service.deleteStoredObject('videos/source.mp4'),
      ).resolves.toBeUndefined();
      expect(post).toHaveBeenCalledWith(`${BASE}/v1/files/delete`, {
        storageKey: 'videos/source.mp4',
      });
    });
  });

  describe('splitImage', () => {
    it('decodes every returned frame back to a buffer', async () => {
      const { post, service } = createHarness();
      post.mockReturnValue(
        of({
          data: {
            frames: [
              Buffer.from('one').toString('base64'),
              Buffer.from('two').toString('base64'),
            ],
          },
        }),
      );

      await expect(
        service.splitImage('https://cdn/sheet.png', 2, 3),
      ).resolves.toEqual({
        frames: [Buffer.from('one'), Buffer.from('two')],
      });
      expect(post).toHaveBeenCalledWith(
        `${BASE}/v1/files/processing/split-image`,
        {
          borderInset: 10,
          gridCols: 3,
          gridRows: 2,
          imageUrl: 'https://cdn/sheet.png',
        },
      );
    });

    it('honours an explicit border inset, including zero', async () => {
      const { post, service } = createHarness();
      post.mockReturnValue(of({ data: { frames: [] } }));

      await service.splitImage('https://cdn/sheet.png', 2, 3, 0);

      expect(post).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ borderInset: 0 }),
      );
    });

    it('logs and rethrows a transport failure', async () => {
      const { loggerService, post, service } = createHarness();
      post.mockReturnValue(throwError(() => new Error('502')));

      await expect(
        service.splitImage('https://cdn/sheet.png', 2, 3),
      ).rejects.toThrowError('502');
      expect(loggerService.error).toHaveBeenCalledWith(
        'Failed to split image',
        expect.any(Error),
      );
    });
  });
});
