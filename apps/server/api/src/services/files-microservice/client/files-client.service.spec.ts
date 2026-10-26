import { Readable } from 'node:stream';
import { FILES_REQUEST_TIMEOUT_MS } from '@api/services/files-microservice/client/files-request-retry.util';
import { FileInputType } from '@genfeedai/contracts';
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

function createHarness(
  filesUrl: string | null = BASE,
  isIssuerEnabled = true,
  apiKey?: string,
) {
  const configService = {
    isAuthorizedMediaDeliveryEnabled: isIssuerEnabled,
    get: vi.fn((key: string) =>
      key === 'GENFEEDAI_MICROSERVICES_FILES_URL'
        ? filesUrl
        : key === 'GENFEEDAI_API_KEY'
          ? apiKey
          : undefined,
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

  it('normalises an ffprobe payload into the persisted media probe shape', async () => {
    const { post, service } = createHarness();
    post.mockReturnValue(
      of({
        data: {
          format: {
            duration: '12.5',
            format_name: 'mov,mp4,m4a,3gp,3g2,mj2',
            size: '2048',
          },
          streams: [
            {
              codec_name: 'H264',
              codec_type: 'video',
              height: 1920,
              r_frame_rate: '30000/1001',
              width: 1080,
            },
            { codec_name: 'AAC', codec_type: 'audio' },
          ],
        },
      }),
    );

    const probe = await service.probeMediaFromUrl(
      'https://cdn.test/clip.mp4',
      'video',
    );

    expect(post).toHaveBeenCalledWith(
      `${BASE}/v1/files/metadata`,
      { url: 'https://cdn.test/clip.mp4' },
      expect.objectContaining({
        headers: { 'x-api-key': '' },
        timeout: expect.any(Number),
      }),
    );
    expect(probe).toEqual(
      expect.objectContaining({
        audioCodec: 'aac',
        container: 'mov,mp4,m4a,3gp,3g2,mj2',
        durationSeconds: 12.5,
        height: 1920,
        kind: 'video',
        sizeBytes: 2048,
        videoCodec: 'h264',
        width: 1080,
      }),
    );
    expect(probe.frameRate).toBeCloseTo(29.97, 2);
    expect(probe.probedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('drops duration and frame rate for a still image', async () => {
    const { post, service } = createHarness();
    post.mockReturnValue(
      of({
        data: {
          format: { format_name: 'png_pipe', size: '4096' },
          streams: [
            {
              codec_name: 'png',
              codec_type: 'video',
              height: 1350,
              r_frame_rate: '0/0',
              width: 1080,
            },
          ],
        },
      }),
    );

    const probe = await service.probeMediaFromUrl(
      'https://cdn.test/card.png',
      'image',
    );

    expect(probe).toEqual(
      expect.objectContaining({
        audioCodec: null,
        container: 'png_pipe',
        durationSeconds: null,
        frameRate: null,
        kind: 'image',
        videoCodec: 'png',
      }),
    );
  });

  it('reports missing probe fields as null rather than zero', async () => {
    const { post, service } = createHarness();
    post.mockReturnValue(of({ data: { format: {}, streams: [] } }));

    const probe = await service.probeMediaFromUrl(
      'https://cdn.test/clip.mp4',
      'video',
    );

    expect(probe).toEqual(
      expect.objectContaining({
        audioCodec: null,
        container: null,
        durationSeconds: null,
        frameRate: null,
        height: null,
        sizeBytes: null,
        videoCodec: null,
        width: null,
      }),
    );
  });

  it('rejects booleans and empty values instead of coercing them to numbers', async () => {
    const { post, service } = createHarness();
    post.mockReturnValue(
      of({
        data: {
          format: { duration: '', format_name: 'mp4', size: null },
          streams: [
            {
              codec_name: 'h264',
              codec_type: 'video',
              height: '   ',
              r_frame_rate: '30/1',
              width: true,
            },
          ],
        },
      }),
    );

    const probe = await service.probeMediaFromUrl(
      'https://cdn.test/clip.mp4',
      'video',
    );

    // `Number(true)` is 1 and `Number(null)` is 0; neither is a measurement.
    expect(probe).toEqual(
      expect.objectContaining({
        durationSeconds: null,
        height: null,
        sizeBytes: null,
        width: null,
      }),
    );
  });

  it('falls back to the local files service when no url is configured', async () => {
    const { post, service } = createHarness(null);
    post.mockReturnValue(of({ data: { data: '' } }));

    await service.resizeImage(Buffer.from('x'), { height: 1, width: 1 });

    expect(post).toHaveBeenCalledWith(
      'http://localhost:3012/v1/files/processing/resize-image',
      expect.anything(),
      expect.objectContaining({ timeout: expect.any(Number) }),
    );
  });

  describe('media perception', () => {
    const HASH = 'e'.repeat(64);

    it('fingerprints an asset URL and validates the answer', async () => {
      const { post, service } = createHarness();
      post.mockReturnValue(of({ data: { assetHash: HASH, sizeBytes: 4096 } }));

      await expect(
        service.fingerprintMedia('https://cdn.test/clip.mp4'),
      ).resolves.toEqual({ assetHash: HASH, sizeBytes: 4096 });
      expect(post).toHaveBeenCalledWith(
        `${BASE}/v1/files/perception/fingerprint`,
        { url: 'https://cdn.test/clip.mp4' },
        expect.objectContaining({
          timeout: 120_000,
        }),
      );
    });

    it('rejects a malformed artefacts payload instead of trusting it', async () => {
      const { post, service } = createHarness();
      post.mockReturnValue(of({ data: { assetHash: HASH, frames: 'nope' } }));

      await expect(
        service.extractPerceptionArtefacts({
          assetHash: HASH,
          frameCount: 6,
          kind: 'video',
          organizationId: 'org-1',
          url: 'https://cdn.test/clip.mp4',
        }),
      ).rejects.toThrow();
      expect(post).toHaveBeenCalledWith(
        `${BASE}/v1/files/perception/artefacts`,
        expect.objectContaining({ assetHash: HASH, frameCount: 6 }),
        expect.objectContaining({
          timeout: 600_000,
        }),
      );
    });
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
        expect.objectContaining({ timeout: expect.any(Number) }),
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
        expect.objectContaining({ timeout: expect.any(Number) }),
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
        expect.objectContaining({ timeout: expect.any(Number) }),
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
        expect.objectContaining({ timeout: expect.any(Number) }),
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
        expect.objectContaining({ timeout: expect.any(Number) }),
      );
    });
  });

  describe('private media storage allocation', () => {
    it.each([
      'images',
      'videos',
      'musics',
      'gifs',
      'audio',
      'audios',
      'voices',
    ])(
      'allocates fresh cloud %s identities for generated URL uploads',
      async (type) => {
        const { post, service } = createHarness();
        const storedResult = { s3Key: `ingredients/${type}/stored-token` };
        post.mockReturnValue(of({ data: storedResult }));
        const source = {
          type: FileInputType.URL,
          url: 'https://provider.test/media',
        } as const;

        await expect(
          service.uploadToS3('ingredient-id', type, source),
        ).resolves.toEqual(storedResult);
        await service.uploadToS3('ingredient-id', type, source);

        const firstKey = post.mock.calls[0]?.[1].key;
        const secondKey = post.mock.calls[1]?.[1].key;
        expect(firstKey).toMatch(/^[a-f0-9-]{36}$/);
        expect(secondKey).toMatch(/^[a-f0-9-]{36}$/);
        expect(firstKey).not.toBe(secondKey);
        expect(firstKey).not.toContain('ingredient-id');
      },
    );

    it('allocates a random object key for buffer and streaming multipart uploads', async () => {
      const { post, service } = createHarness();
      post.mockReturnValue(
        of({ data: { s3Key: 'ingredients/images/random' } }),
      );
      await service.uploadToS3('ingredient-id.png', 'images', {
        type: FileInputType.BUFFER,
        data: Buffer.from('image'),
        contentType: 'image/png',
      });
      await service.uploadStreamToS3('ingredient-id.png', 'images', {
        data: Buffer.from('image'),
        contentType: 'image/png',
      });
      const keys = post.mock.calls.map(
        (call) =>
          (call[1] as FormData)
            .getBuffer()
            .toString()
            .match(/name="key"\r\n\r\n([^\r]+)/)?.[1],
      );
      expect(keys).toHaveLength(2);
      for (const key of keys) expect(key).toMatch(/^[a-f0-9-]{36}\.png$/);
      expect(keys[0]).not.toBe(keys[1]);
    });

    it.each(['disabled', 'self-hosted'] as const)(
      'keeps existing allocation for %s delivery',
      async (mode) => {
        const { post, service } = createHarness(BASE, mode !== 'disabled');
        isSelfHostedDeployment.mockReturnValue(mode === 'self-hosted');
        post.mockReturnValue(of({ data: {} }));
        await service.uploadToS3('ingredient-id', 'images', {
          type: FileInputType.URL,
          url: 'https://provider.test/media',
        });
        expect(post.mock.calls[0]?.[1].key).toBe('ingredient-id');
      },
    );

    it('preserves the exact canonical stored identity only through the explicit server method', async () => {
      const { post, service } = createHarness();
      post.mockReturnValue(
        of({ data: { s3Key: 'ingredients/images/stored-token.png' } }),
      );
      const source = {
        type: FileInputType.URL,
        url: 'https://s3.test/signed-existing',
      } as const;
      await service.uploadToExistingObject(
        'ingredients/images/stored-token.png',
        'images',
        source,
      );
      expect(post).toHaveBeenCalledWith(
        `${BASE}/v1/files/upload`,
        {
          key: 'stored-token.png',
          source,
          type: 'images',
        },
        expect.objectContaining({ timeout: expect.any(Number) }),
      );
      await service.uploadToS3('stored-token.png', 'images', source);
      expect(post.mock.calls[1]?.[1].key).not.toBe('stored-token.png');
    });

    it('rejects a stored key from another category before the files request', async () => {
      const { post, service } = createHarness();
      await expect(
        service.uploadToExistingObject('ingredients/videos/stored', 'images', {
          type: FileInputType.URL,
          url: 'https://s3.test/signed-existing',
        }),
      ).rejects.toThrow('does not match the media category');
      expect(post).not.toHaveBeenCalled();
    });
  });

  describe('uploadToS3', () => {
    it('sends a buffer source as multipart, not base64 JSON', async () => {
      const { post, service } = createHarness(BASE, false);
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
          timeout: expect.any(Number),
          headers: expect.any(Object),
          maxBodyLength: Number.POSITIVE_INFINITY,
        }),
      );
      expect(post.mock.calls[0]?.[1]).toBeInstanceOf(FormData);
      expect(post.mock.calls[0]?.[0]).not.toBe(`${BASE}/v1/files/upload`);
    });

    it('streams a readable to the multipart upload route', async () => {
      const { post, service } = createHarness(BASE, false);
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
      const { put, service } = createHarness(BASE, false);
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
      const { loggerService, put, service } = createHarness(BASE, false);
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
      const { post, service } = createHarness(BASE, false);
      post.mockReturnValue(of({ data: {} }));
      const source = {
        type: FileInputType.URL,
        url: 'https://cdn/a.mp3',
      } as never;

      await service.uploadToS3('key-1', 'musics', source);

      expect(post).toHaveBeenCalledWith(
        `${BASE}/v1/files/upload`,
        expect.objectContaining({ source }),
        expect.objectContaining({ timeout: expect.any(Number) }),
      );
    });

    it('logs and rethrows a transport failure', async () => {
      const { loggerService, post, service } = createHarness(BASE, false);
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
        expect.objectContaining({
          responseType: 'stream',
          timeout: expect.any(Number),
        }),
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

    it('preserves the cloud public URL until authorized delivery is activated', async () => {
      const { post, service } = createHarness(BASE, false);
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
        service.getPresignedUploadUrl('key-1', 'images'),
      ).resolves.toMatchObject({ publicUrl: 'https://cdn/key-1' });
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
        publicUrl: '',
        s3Key: 's3/key-1',
        uploadMethod: 'PUT',
        uploadUrl: 'https://s3/put',
      });
      expect(post).toHaveBeenCalledWith(
        `${BASE}/v1/files/presigned-upload`,
        {
          contentType: 'audio/mpeg',
          filename: expect.stringMatching(/^[a-f0-9-]{36}$/),
          type: 'musics',
        },
        expect.objectContaining({ timeout: expect.any(Number) }),
      );
    });

    it('defaults the content type to an opaque octet stream', async () => {
      const { post, service } = createHarness();
      post.mockReturnValue(of({ data: {} }));

      await service.getPresignedUploadUrl('key-1', 'musics');

      expect(post).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ contentType: 'application/octet-stream' }),
        expect.objectContaining({ timeout: expect.any(Number) }),
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
        expect.objectContaining({ timeout: expect.any(Number) }),
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

  describe('getPresignedDownloadUrlForObjectKey', () => {
    it('posts the stored key byte-for-byte, including reserved URL characters', async () => {
      const { get, post, service } = createHarness();
      const storageKey = 'ingredients/images/random key?part=#preview%2F.png';
      post.mockReturnValue(
        of({ data: { downloadUrl: 'https://s3/get?signature=grant' } }),
      );
      await expect(
        service.getPresignedDownloadUrlForObjectKey(storageKey),
      ).resolves.toBe('https://s3/get?signature=grant');
      expect(post).toHaveBeenCalledWith(
        `${BASE}/v1/files/presigned-download`,
        {
          storageKey,
        },
        expect.objectContaining({ timeout: expect.any(Number) }),
      );
      expect(get).not.toHaveBeenCalled();
    });
  });

  describe('copyInS3', () => {
    it('posts both keys and their types', async () => {
      const { post, service } = createHarness();
      post.mockReturnValue(of({ data: {} }));

      await expect(
        service.copyInS3('src', 'dst', 'musics', 'videos'),
      ).resolves.toBeUndefined();
      expect(post).toHaveBeenCalledWith(
        `${BASE}/v1/files/copy`,
        {
          destinationKey: 'dst',
          destinationType: 'videos',
          sourceKey: 'src',
          sourceType: 'musics',
        },
        expect.objectContaining({ timeout: expect.any(Number) }),
      );
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
      expect(post).toHaveBeenCalledWith(
        `${BASE}/v1/files/delete`,
        {
          storageKey: 'videos/source.mp4',
        },
        expect.objectContaining({ timeout: expect.any(Number) }),
      );
    });
  });

  describe('storedObjectExists', () => {
    it('asks the files service about one full storage key', async () => {
      const { post, service } = createHarness(BASE, true, 'service-key');
      post.mockReturnValue(of({ data: { exists: true } }));

      await expect(
        service.storedObjectExists('ingredients/images/a'),
      ).resolves.toBe(true);
      expect(post).toHaveBeenCalledWith(
        `${BASE}/v1/files/exists`,
        { storageKey: 'ingredients/images/a' },
        expect.objectContaining({
          headers: { 'x-api-key': 'service-key' },
          timeout: expect.any(Number),
        }),
      );
    });

    it('treats anything but an explicit true as missing', async () => {
      const { post, service } = createHarness();
      post.mockReturnValue(of({ data: {} }));

      await expect(service.storedObjectExists('k')).resolves.toBe(false);
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
        expect.objectContaining({ timeout: expect.any(Number) }),
      );
    });

    it('honours an explicit border inset, including zero', async () => {
      const { post, service } = createHarness();
      post.mockReturnValue(of({ data: { frames: [] } }));

      await service.splitImage('https://cdn/sheet.png', 2, 3, 0);

      expect(post).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ borderInset: 0 }),
        expect.objectContaining({ timeout: expect.any(Number) }),
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

  describe('validated upload metadata', () => {
    it.each([undefined, '', 42, null, {}])(
      'rejects an invalid canonical key in enabled cloud delivery: %s',
      async (s3Key) => {
        const { post, service } = createHarness();
        post.mockReturnValue(of({ data: { s3Key } }));
        await expect(
          service.uploadToS3('ingredient-id', 'images', {
            type: FileInputType.URL,
            url: 'https://provider.test/source.png',
          }),
        ).rejects.toThrow();
      },
    );

    it('preserves numeric metadata, literal key bytes, and extension fields', async () => {
      const { post, service } = createHarness();
      const payload = {
        s3Key: 'ingredients/images/raw%2F?#.png',
        width: 1080,
        height: 1920,
        size: 4096,
        extension: 'png',
        providerMetadata: { source: 'fixture' },
      };
      post.mockReturnValue(of({ data: payload }));
      await expect(
        service.uploadToS3('ingredient-id', 'images', {
          type: FileInputType.URL,
          url: 'https://provider.test/source.png',
        }),
      ).resolves.toEqual(payload);
    });

    it('validates multipart metadata before returning it for persistence', async () => {
      const { post, service } = createHarness();
      post.mockReturnValue(of({ data: { s3Key: 42 } }));
      await expect(
        service.uploadToS3('ingredient-id', 'images', {
          type: FileInputType.BUFFER,
          data: Buffer.from('image'),
          contentType: 'image/png',
        }),
      ).rejects.toThrow();
    });

    it('validates canonical confirmation responses before returning them', async () => {
      const { post, service } = createHarness();
      post.mockReturnValue(of({ data: { s3Key: '' } }));
      await expect(
        service.uploadToExistingObject(
          'ingredients/images/canonical',
          'images',
          { type: FileInputType.URL, url: 'https://provider.test/source.png' },
        ),
      ).rejects.toThrow();
    });
  });
});

describe('metadata service authentication', () => {
  it('authenticates both extraction and media probes to the configured service', async () => {
    const { service, post } = createHarness(BASE, true, 'metadata-key');
    post.mockReturnValue(
      of({ data: { format: { duration: '2' }, streams: [] } }),
    );
    await service.extractMetadataFromUrl('https://cdn.test/audio.mp3');
    await service.probeMediaFromUrl('https://cdn.test/audio.mp3', 'audio');
    expect(post).toHaveBeenCalledTimes(2);
    for (const call of post.mock.calls)
      expect(call).toEqual([
        `${BASE}/v1/files/metadata`,
        { url: 'https://cdn.test/audio.mp3' },
        {
          headers: { 'x-api-key': 'metadata-key' },
          timeout: expect.any(Number),
        },
      ]);
  });
});

describe('FilesClientService retries and timeouts', () => {
  const transientError = (code: string) =>
    Object.assign(new Error(code), { code });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('retries an idempotent lookup after a mid-flight reset', async () => {
    vi.useFakeTimers();
    const { loggerService, post, service } = createHarness();
    post
      .mockReturnValueOnce(throwError(() => transientError('ECONNRESET')))
      .mockReturnValueOnce(of({ data: { exists: true } }));

    const result = service.storedObjectExists('ingredients/images/a');
    await vi.runAllTimersAsync();

    await expect(result).resolves.toBe(true);
    expect(post).toHaveBeenCalledTimes(2);
    expect(loggerService.warn).toHaveBeenCalledWith(
      'Retrying files service request: storedObjectExists',
      { attempt: 1, code: 'ECONNRESET' },
    );
  });

  it('gives up on an idempotent call after two retries', async () => {
    vi.useFakeTimers();
    const { post, service } = createHarness();
    post.mockReturnValue(throwError(() => transientError('ECONNRESET')));

    const result = service.storedObjectExists('k');
    const assertion = expect(result).rejects.toThrowError('ECONNRESET');
    await vi.runAllTimersAsync();

    await assertion;
    expect(post).toHaveBeenCalledTimes(3);
  });

  it('retries a mutating call only when the request never left the host', async () => {
    vi.useFakeTimers();
    const { post, service } = createHarness();
    post
      .mockReturnValueOnce(throwError(() => transientError('ENOTFOUND')))
      .mockReturnValueOnce(of({ data: {} }));

    const result = service.copyInS3('src', 'dst');
    await vi.runAllTimersAsync();

    await expect(result).resolves.toBeUndefined();
    expect(post).toHaveBeenCalledTimes(2);
  });

  it.each([['ECONNRESET'], ['ETIMEDOUT']])(
    'never replays a non-idempotent copy after %s',
    async (code) => {
      const { post, service } = createHarness();
      post.mockReturnValue(throwError(() => transientError(code)));

      await expect(service.copyInS3('src', 'dst')).rejects.toThrowError(code);
      expect(post).toHaveBeenCalledTimes(1);
    },
  );

  it('never replays a processing POST after a socket hang up', async () => {
    const { post, service } = createHarness();
    post.mockReturnValue(throwError(() => new Error('socket hang up')));

    await expect(
      service.resizeImage(Buffer.from('img'), { height: 100, width: 100 }),
    ).rejects.toThrowError('socket hang up');
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('never replays a request the server already answered', async () => {
    const { post, service } = createHarness();
    post.mockReturnValue(
      throwError(() =>
        Object.assign(new Error('bad gateway'), {
          code: 'ECONNRESET',
          response: { status: 502 },
        }),
      ),
    );

    await expect(service.storedObjectExists('k')).rejects.toThrowError(
      'bad gateway',
    );
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('rebuilds the multipart form for each pre-send retry of a buffer upload', async () => {
    vi.useFakeTimers();
    const { post, service } = createHarness(BASE, false);
    post
      .mockReturnValueOnce(throwError(() => transientError('ECONNREFUSED')))
      .mockReturnValueOnce(of({ data: { publicUrl: 'https://cdn/a.png' } }));

    const result = service.uploadToS3('key-1', 'images', {
      contentType: 'image/png',
      data: Buffer.from('png'),
      type: FileInputType.BUFFER,
    });
    await vi.runAllTimersAsync();

    await expect(result).resolves.toEqual({ publicUrl: 'https://cdn/a.png' });
    expect(post).toHaveBeenCalledTimes(2);
    const [firstForm, secondForm] = post.mock.calls.map((call) => call[1]);
    expect(firstForm).toBeInstanceOf(FormData);
    expect(secondForm).toBeInstanceOf(FormData);
    expect(secondForm).not.toBe(firstForm);
  });

  it('never retries a stream upload', async () => {
    const { post, service } = createHarness(BASE, false);
    post.mockReturnValue(throwError(() => transientError('ENOTFOUND')));

    await expect(
      service.uploadStreamToS3('key-1', 'videos', {
        contentType: 'video/mp4',
        data: Readable.from(Buffer.from('video-bytes')),
        filename: 'clip.mp4',
      }),
    ).rejects.toThrowError('ENOTFOUND');
    expect(post).toHaveBeenCalledTimes(1);
  });

  it.each([
    [
      'storedObjectExists',
      FILES_REQUEST_TIMEOUT_MS.QUICK,
      (service: InstanceType<typeof FilesClientService>) =>
        service.storedObjectExists('k'),
    ],
    [
      'copyInS3',
      FILES_REQUEST_TIMEOUT_MS.PROCESSING,
      (service: InstanceType<typeof FilesClientService>) =>
        service.copyInS3('src', 'dst'),
    ],
    [
      'inspectVideoQa',
      FILES_REQUEST_TIMEOUT_MS.HEAVY_PROCESSING,
      (service: InstanceType<typeof FilesClientService>) =>
        service.inspectVideoQa({
          blackDurationSeconds: 1,
          freezeDurationSeconds: 1,
          isContactSheetEnabled: false,
          videoUrl: 'https://cdn.test/v.mp4',
        }),
    ],
  ])('sends an explicit %s timeout', async (_name, timeout, invoke) => {
    const { post, service } = createHarness();
    post.mockReturnValue(of({ data: { exists: true } }));

    await invoke(service).catch(() => undefined);

    expect(post).toHaveBeenCalledWith(
      expect.any(String),
      expect.anything(),
      expect.objectContaining({ timeout }),
    );
  });

  it('gives a download the download timeout', async () => {
    const { get, service } = createHarness();
    get.mockReturnValue(of({ data: Readable.from([]) }));

    await service.getFileFromS3('key-1', 'videos');

    expect(get).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ timeout: FILES_REQUEST_TIMEOUT_MS.DOWNLOAD }),
    );
  });
});
