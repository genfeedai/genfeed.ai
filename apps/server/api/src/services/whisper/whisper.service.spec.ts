import { FileQueueService } from '@api/services/files-microservice/queue/file-queue.service';
import { ReplicateService } from '@api/services/integrations/replicate/services/replicate.service';
import { AuthorizedMediaUrlService } from '@api/services/media-urls/authorized-media-url.service';
import { MediaUrlService } from '@api/services/media-urls/media-url.service';
import { WhisperService } from '@api/services/whisper/whisper.service';
import { MAX_FILE_SIZE } from '@genfeedai/contracts/constants';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { safeFetch } from '@libs/security/destination-guard';
import { Test, TestingModule } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@libs/security/destination-guard', () => ({ safeFetch: vi.fn() }));
const safeFetchMock = vi.mocked(safeFetch);

type UploadedAudioFile = {
  buffer: Buffer;
  originalname?: string;
};

vi.mock('node:fs', () => ({
  default: {
    existsSync: vi.fn().mockReturnValue(false),
    mkdirSync: vi.fn(),
    readFileSync: vi.fn().mockReturnValue(Buffer.from('audio-data')),
    unlinkSync: vi.fn(),
    writeFileSync: vi.fn(),
  },
  existsSync: vi.fn().mockReturnValue(false),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn().mockReturnValue(Buffer.from('audio-data')),
  unlinkSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

function createMockLogger() {
  return {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };
}

describe('WhisperService', () => {
  let service: WhisperService;
  let isIssuerEnabled = false;
  let cdnUrl = 'https://cdn.genfeed.ai';
  let ingredientsEndpoint = 'https://api.test.com';
  const mediaIssuer = { issueServerPublish: vi.fn() };
  let replicateMock: Record<string, ReturnType<typeof vi.fn>>;
  let fileQueueMock: Record<string, ReturnType<typeof vi.fn>>;
  let logger: ReturnType<typeof createMockLogger>;
  let mediaUrlMock: { buildUrlFromAbsolute: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    isIssuerEnabled = false;
    cdnUrl = 'https://cdn.genfeed.ai';
    ingredientsEndpoint = 'https://api.test.com';
    safeFetchMock
      .mockReset()
      .mockImplementation(async () => new Response(Buffer.from('video-data')));
    mediaIssuer.issueServerPublish.mockReset();
    replicateMock = {
      transcribeAudio: vi.fn().mockResolvedValue({
        duration: 5,
        language: 'en',
        segments: [{ end: 5, start: 0, text: 'Hello world' }],
        text: 'Hello world',
      }),
    };
    fileQueueMock = {
      processVideo: vi.fn().mockResolvedValue({ jobId: 'job-123' }),
      waitForJob: vi.fn().mockResolvedValue({
        success: true,
        url: 'https://cdn.example.com/audio.mp3',
      }),
    };
    logger = createMockLogger();
    mediaUrlMock = {
      buildUrlFromAbsolute: vi.fn((url: string) => url),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: AuthorizedMediaUrlService, useValue: mediaIssuer },
        WhisperService,
        {
          provide: ConfigService,
          useValue: {
            get: vi.fn().mockReturnValue('test-endpoint'),
            get isAuthorizedMediaDeliveryEnabled() {
              return isIssuerEnabled;
            },
            get cdnUrl() {
              return cdnUrl;
            },
            get ingredientsEndpoint() {
              return ingredientsEndpoint;
            },
          },
        },
        { provide: LoggerService, useValue: logger },
        { provide: FileQueueService, useValue: fileQueueMock },
        { provide: ReplicateService, useValue: replicateMock },
        { provide: MediaUrlService, useValue: mediaUrlMock },
      ],
    }).compile();

    service = module.get<WhisperService>(WhisperService);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('transcribeAudio', () => {
    it('should transcribe audio from a file buffer', async () => {
      const file = {
        buffer: Buffer.from('audio-data'),
        originalname: 'test.mp3',
      } as UploadedAudioFile;

      const result = await service.transcribeAudio(file);
      expect(result).toBe('Hello world');
      expect(replicateMock.transcribeAudio).toHaveBeenCalledWith({
        audio: {
          data: file.buffer,
          filename: 'test.mp3',
          type: 'buffer',
        },
      });
    });

    it('should use default filename when originalname is empty', async () => {
      const file = {
        buffer: Buffer.from('audio-data'),
        originalname: '',
      } as UploadedAudioFile;

      await service.transcribeAudio(file);
      expect(replicateMock.transcribeAudio).toHaveBeenCalledWith({
        audio: {
          data: file.buffer,
          filename: 'audio.mp3',
          type: 'buffer',
        },
      });
    });

    it('should propagate errors from replicate service', async () => {
      replicateMock.transcribeAudio.mockRejectedValue(
        new Error('Replicate API error'),
      );

      const file = {
        buffer: Buffer.from('audio-data'),
        originalname: 'test.mp3',
      } as UploadedAudioFile;

      await expect(service.transcribeAudio(file)).rejects.toThrow(
        'Replicate API error',
      );
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('transcribeUrl', () => {
    it('should transcribe audio from a URL', async () => {
      const result = await service.transcribeUrl(
        'https://example.com/audio.mp3',
      );
      expect(result).toEqual({
        duration: 5,
        language: 'en',
        segments: [{ end: 5, start: 0, text: 'Hello world' }],
        srt: expect.stringContaining('Hello world'),
        text: 'Hello world',
      });
    });

    it('should generate SRT with segments', async () => {
      replicateMock.transcribeAudio.mockResolvedValue({
        duration: 10,
        language: 'en',
        segments: [
          { end: 5, start: 0, text: 'Hello' },
          { end: 10, start: 5, text: 'World' },
        ],
        text: 'Hello World',
      });

      const result = await service.transcribeUrl(
        'https://example.com/audio.mp3',
      );
      expect(result.srt).toContain('1\n00:00:00,000 --> 00:00:05,000\nHello');
      expect(result.srt).toContain('2\n00:00:05,000 --> 00:00:10,000\nWorld');
    });

    it('should fallback to single SRT entry when no segments', async () => {
      replicateMock.transcribeAudio.mockResolvedValue({
        duration: 3,
        language: 'en',
        segments: [],
        text: 'Short clip',
      });

      const result = await service.transcribeUrl(
        'https://example.com/audio.mp3',
      );
      expect(result.srt).toBe('1\n00:00:00,000 --> 00:00:03,000\nShort clip');
    });

    it('should pass language parameter', async () => {
      await service.transcribeUrl('https://example.com/audio.mp3', 'fr');
      expect(replicateMock.transcribeAudio).toHaveBeenCalledWith(
        expect.objectContaining({ language: 'fr' }),
      );
    });

    it('should propagate HTTP errors', async () => {
      safeFetchMock.mockRejectedValue(new Error('Network error'));

      await expect(
        service.transcribeUrl('https://example.com/audio.mp3'),
      ).rejects.toThrow('Network error');
    });
  });

  describe('generateCaptions', () => {
    it('downloads a fresh organization-bound grant instead of a supplied source when activated', async () => {
      isIssuerEnabled = true;
      mediaIssuer.issueServerPublish.mockResolvedValue(
        new Map([
          [
            'ingredient-123',
            'https://cdn.genfeed.ai/opaque-original?Signature=fresh',
          ],
        ]),
      );
      await service.generateCaptions(
        'ingredient-123',
        { s3Key: 'foreign/caller-key.mp4' },
        'org-1',
      );
      expect(mediaIssuer.issueServerPublish).toHaveBeenCalledWith('org-1', [
        'ingredient-123',
      ]);
      expect(safeFetchMock).toHaveBeenCalledWith(
        'https://cdn.genfeed.ai/opaque-original?Signature=fresh',
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
        expect.any(Object),
      );
      expect(mediaUrlMock.buildUrlFromAbsolute).not.toHaveBeenCalled();
    });

    it('requires organization proof and never falls back to an ID-derived URL when activated', async () => {
      isIssuerEnabled = true;
      await expect(service.generateCaptions('ingredient-123')).rejects.toThrow(
        'organization-bound',
      );
      expect(safeFetchMock).not.toHaveBeenCalled();
      mediaIssuer.issueServerPublish.mockResolvedValue(new Map());
      await expect(
        service.generateCaptions('ingredient-123', undefined, 'org-1'),
      ).rejects.toThrow('unavailable');
      expect(safeFetchMock).not.toHaveBeenCalled();
    });

    it('uses the same single-entry SRT fallback when no segments exist', async () => {
      replicateMock.transcribeAudio.mockResolvedValue({
        duration: 3,
        language: 'en',
        segments: [],
        text: 'Short clip',
      });

      await expect(service.generateCaptions('ingredient-123')).resolves.toBe(
        '1\n00:00:00,000 --> 00:00:03,000\nShort clip',
      );
    });

    it('should throw when video download fails', async () => {
      safeFetchMock.mockImplementation(() => {
        throw new Error('Download failed');
      });

      await expect(service.generateCaptions('ingredient-123')).rejects.toThrow(
        'Unable to download video',
      );
    });

    it('downloads the resolved storage URL instead of the reconstructed path', async () => {
      await service.generateCaptions('ingredient-123', {
        s3Key: 'ingredients/videos/ingredient-123.mp4',
      });

      expect(safeFetchMock).toHaveBeenCalledWith(
        'https://cdn.genfeed.ai/ingredients/videos/ingredient-123.mp4',
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
        expect.any(Object),
      );
    });

    it('downloads through a signed URL when the deployment signs media', async () => {
      mediaUrlMock.buildUrlFromAbsolute.mockImplementation(
        (url: string) => `${url}?Signature=signed`,
      );

      await service.generateCaptions('ingredient-123', {
        s3Key: 'ingredients/videos/ingredient-123.mp4',
      });

      expect(safeFetchMock).toHaveBeenCalledWith(
        'https://cdn.genfeed.ai/ingredients/videos/ingredient-123.mp4?Signature=signed',
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
        expect.any(Object),
      );
    });
  });

  describe('guarded media download boundary', () => {
    it('uses the canonical guarded transport for untrusted transcription media', async () => {
      const audioUrl = 'https://external.example/audio.mp3?token=opaque';
      await service.transcribeUrl(audioUrl);
      expect(safeFetchMock).toHaveBeenCalledWith(
        audioUrl,
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
        expect.objectContaining({ allowPrivateNetwork: false }),
      );
    });

    it('does not grant external media the configured CDN private-network exception', async () => {
      await service.transcribeUrl('http://127.0.0.1:3010/private.mp3');
      expect(safeFetchMock).toHaveBeenCalledWith(
        'http://127.0.0.1:3010/private.mp3',
        expect.anything(),
        expect.objectContaining({ allowPrivateNetwork: false }),
      );
    });

    it('restricts the configured CDN exception and redirects to its exact origin', async () => {
      await service.generateCaptions('ingredient-123', {
        s3Key: 'media/video.mp4',
      });
      expect(safeFetchMock).toHaveBeenCalledWith(
        'https://cdn.genfeed.ai/media/video.mp4',
        expect.anything(),
        expect.objectContaining({
          allowPrivateNetwork: true,
          allowedOrigins: ['https://cdn.genfeed.ai'],
        }),
      );
    });

    it('preserves configured private CDN delivery without allowing a different port', async () => {
      cdnUrl = 'http://127.0.0.1:9000';
      await service.transcribeUrl(`${cdnUrl}/audio.mp3`);
      expect(safeFetchMock).toHaveBeenLastCalledWith(
        `${cdnUrl}/audio.mp3`,
        expect.anything(),
        { allowPrivateNetwork: true, allowedOrigins: [cdnUrl] },
      );
      await service.transcribeUrl('http://127.0.0.1:9001/audio.mp3');
      expect(safeFetchMock).toHaveBeenLastCalledWith(
        'http://127.0.0.1:9001/audio.mp3',
        expect.anything(),
        { allowPrivateNetwork: false },
      );
    });

    it('allows the ingredients origin only for the internally constructed fallback', async () => {
      ingredientsEndpoint = 'http://localhost:3010/v1/ingredients';
      await service.generateCaptions('ingredient-123');
      expect(safeFetchMock).toHaveBeenCalledWith(
        `${ingredientsEndpoint}/videos/ingredient-123`,
        expect.anything(),
        {
          allowPrivateNetwork: true,
          allowedOrigins: ['http://localhost:3010'],
        },
      );
      await service.transcribeUrl('http://localhost:3010/private.mp3');
      expect(safeFetchMock).toHaveBeenLastCalledWith(
        'http://localhost:3010/private.mp3',
        expect.anything(),
        { allowPrivateNetwork: false },
      );
    });

    it('rejects guarded destinations before conversion or transcription', async () => {
      safeFetchMock.mockRejectedValue(new Error('Blocked destination'));
      await expect(
        service.generateCaptions('ingredient-123', {
          metadata: { result: 'http://169.254.169.254/metadata' },
        }),
      ).rejects.toThrow('Blocked destination');
      expect(fileQueueMock.processVideo).not.toHaveBeenCalled();
      expect(replicateMock.transcribeAudio).not.toHaveBeenCalled();
    });

    it('guards converted audio and does not transcribe if that download fails', async () => {
      safeFetchMock
        .mockResolvedValueOnce(new Response('video'))
        .mockRejectedValueOnce(new Error('Blocked converted audio'));
      await expect(service.generateCaptions('ingredient-123')).rejects.toThrow(
        'Blocked converted audio',
      );
      expect(safeFetchMock).toHaveBeenLastCalledWith(
        'https://cdn.example.com/audio.mp3',
        expect.anything(),
        { allowPrivateNetwork: false },
      );
      expect(replicateMock.transcribeAudio).not.toHaveBeenCalled();
    });

    it('preserves read errors while attempting cancellation and releasing the reader', async () => {
      const reader = {
        cancel: vi.fn().mockRejectedValue(new Error('cancel failure')),
        read: vi.fn().mockRejectedValue(new Error('stream interrupted')),
        releaseLock: vi.fn(),
      };
      safeFetchMock.mockResolvedValue({
        ok: true,
        headers: new Headers(),
        body: { getReader: () => reader },
      } as unknown as Response);
      await expect(
        service.transcribeUrl('https://external.example/audio.mp3'),
      ).rejects.toThrow('stream interrupted');
      expect(reader.cancel).toHaveBeenCalledOnce();
      expect(reader.releaseLock).toHaveBeenCalledOnce();
      expect(replicateMock.transcribeAudio).not.toHaveBeenCalled();
    });

    it('rejects declared oversized media before transcription and cancels its body', async () => {
      const cancel = vi.fn();
      const body = new ReadableStream({ cancel });
      safeFetchMock.mockResolvedValue(
        new Response(body, {
          headers: { 'content-length': String(MAX_FILE_SIZE + 1) },
        }),
      );
      await expect(
        service.transcribeUrl('https://external.example/audio.mp3'),
      ).rejects.toThrow('size limit');
      expect(cancel).toHaveBeenCalledOnce();
      expect(replicateMock.transcribeAudio).not.toHaveBeenCalled();
    });

    it('bounds streamed media without trusting content-length and releases its reader', async () => {
      const reader = {
        cancel: vi.fn().mockResolvedValue(undefined),
        read: vi.fn().mockResolvedValue({
          done: false,
          value: { byteLength: MAX_FILE_SIZE + 1 },
        }),
        releaseLock: vi.fn(),
      };
      safeFetchMock.mockResolvedValue({
        ok: true,
        headers: new Headers(),
        body: { getReader: () => reader },
      } as unknown as Response);
      await expect(
        service.transcribeUrl('https://external.example/audio.mp3'),
      ).rejects.toThrow('size limit');
      expect(reader.cancel).toHaveBeenCalledOnce();
      expect(reader.releaseLock).toHaveBeenCalledOnce();
      expect(replicateMock.transcribeAudio).not.toHaveBeenCalled();
    });

    it('retains its deadline while consuming a stalled response body', async () => {
      vi.useFakeTimers();
      let cancel: ReturnType<typeof vi.fn> | undefined;
      safeFetchMock.mockImplementation(async (_url, init) => {
        cancel = vi.fn().mockResolvedValue(undefined);
        const reader = {
          cancel,
          releaseLock: vi.fn(),
          read: () =>
            new Promise((_resolve, reject) => {
              init?.signal?.addEventListener(
                'abort',
                () => reject(new Error('body aborted')),
                { once: true },
              );
            }),
        };
        return {
          ok: true,
          headers: new Headers(),
          body: { getReader: () => reader },
        } as unknown as Response;
      });
      const failure = expect(
        service.transcribeUrl('https://external.example/audio.mp3'),
      ).rejects.toThrow('timeout');
      await vi.advanceTimersByTimeAsync(60_001);
      await failure;
      expect(cancel).toHaveBeenCalledOnce();
      expect(replicateMock.transcribeAudio).not.toHaveBeenCalled();
    });

    it('times out stalled response headers before any provider call', async () => {
      vi.useFakeTimers();
      safeFetchMock.mockImplementation(
        (_url, init) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener(
              'abort',
              () => reject(new Error('media timeout')),
              { once: true },
            );
          }),
      );
      const failure = expect(
        service.transcribeUrl('https://external.example/audio.mp3'),
      ).rejects.toThrow('timeout');
      await vi.advanceTimersByTimeAsync(60_001);
      await failure;
      expect(replicateMock.transcribeAudio).not.toHaveBeenCalled();
    });
  });
});
