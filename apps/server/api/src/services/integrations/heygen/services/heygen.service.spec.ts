import { NotFoundException } from '@api/exceptions/not-found.exception';
import { ApiKeyHelperService } from '@api/services/api-key/api-key-helper.service';
import { ByokService } from '@api/services/byok/byok.service';
import { HeyGenSubmissionRejectedError } from '@api/services/integrations/heygen/errors/heygen-submission-rejected.error';
import { HeyGenService } from '@api/services/integrations/heygen/services/heygen.service';
import { PollUntilService } from '@api/shared/services/poll-until/poll-until.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { of, throwError } from 'rxjs';

describe('HeyGenService', () => {
  let service: HeyGenService;

  const loggerMock = {
    error: vi.fn(),
    log: vi.fn(),
  } as unknown as LoggerService;

  const apiKeyHelperMock = {
    getApiKey: vi.fn().mockReturnValue('test-api-key'),
  };

  const httpServiceMock = {
    get: vi.fn(),
    post: vi.fn(),
  };

  beforeEach(async () => {
    httpServiceMock.get.mockReturnValue(
      of({
        data: { data: [], has_more: false, next_token: null },
        status: 200,
      }),
    );
    httpServiceMock.post.mockReturnValue(
      of({
        data: { data: { avatar_id: '123' } },
        status: 200,
      }),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HeyGenService,
        {
          provide: ByokService,
          useValue: {
            resolveApiKey: vi.fn().mockResolvedValue(null),
            lookupApiKeyWithIdentity: vi.fn().mockResolvedValue(null),
          },
        },
        { provide: LoggerService, useValue: loggerMock },
        { provide: ApiKeyHelperService, useValue: apiKeyHelperMock },
        { provide: HttpService, useValue: httpServiceMock },
        {
          provide: PollUntilService,
          useValue: {
            poll: vi.fn(async (read: () => Promise<unknown>) => ({
              attempts: 1,
              elapsedMs: 1,
              value: await read(),
            })),
          },
        },
      ],
    }).compile();

    service = module.get<HeyGenService>(HeyGenService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('finds all voices', async () => {
    httpServiceMock.get.mockReturnValueOnce(
      of({
        data: {
          data: [{ voice_id: 'voice-id', preview_audio_url: 'p', name: 'n' }],
          has_more: false,
          next_token: null,
        },
        status: 200,
      }),
    );

    const res = await service.getVoices();
    expect(res).toEqual([
      expect.objectContaining({
        index: 0,
        name: 'n',
        preview: 'p',
        voiceId: 'voice-id',
        ownership: 'public',
      }),
    ]);
    expect(httpServiceMock.get).toHaveBeenCalled();
  });

  it('finds all avatars', async () => {
    httpServiceMock.get.mockReturnValueOnce(
      of({
        data: {
          data: [{ id: 'look-id', name: 'n', preview_image_url: 'p' }],
          has_more: false,
          next_token: null,
        },
        status: 200,
      }),
    );

    const res = await service.getAvatars();
    expect(res).toEqual([
      expect.objectContaining({
        avatarId: 'look-id',
        index: 0,
        name: 'n',
        preview: 'p',
      }),
    ]);
    expect(httpServiceMock.get).toHaveBeenCalled();
  });

  it('creates HeyGen Video on v3 and returns the completed video URL', async () => {
    httpServiceMock.post.mockReturnValueOnce(
      of({
        data: { data: { status: 'pending', video_id: 'vid_1' } },
        status: 202,
      }),
    );
    httpServiceMock.get.mockReturnValueOnce(
      of({
        data: {
          data: {
            status: 'completed',
            video_url: 'https://files.heygen.ai/vid_1.mp4',
          },
        },
        status: 200,
      }),
    );

    await expect(
      service.generateModelVideo({
        duration: 8,
        imageUrls: ['https://cdn.test/face.png'],
        prompt: 'a presenter walks toward camera',
        resolution: '768p',
      }),
    ).resolves.toEqual({
      videoUrl: 'https://files.heygen.ai/vid_1.mp4',
    });

    expect(httpServiceMock.post).toHaveBeenCalledWith(
      'https://api.heygen.com/v3/models/videos',
      expect.objectContaining({
        duration: 8,
        image: { type: 'url', url: 'https://cdn.test/face.png' },
        mode: 'image_to_video',
        model: 'heygen-video-1',
        prompt_enhancement: 'disabled',
        resolution: '768p',
      }),
      expect.objectContaining({
        headers: expect.objectContaining({
          'Idempotency-Key': expect.any(String),
          'X-Api-Key': 'test-api-key',
        }),
      }),
    );
    expect(httpServiceMock.get).toHaveBeenCalledWith(
      'https://api.heygen.com/v3/models/videos/vid_1',
      expect.any(Object),
    );
  });
  describe('generateSpeech', () => {
    const speechRequest = {
      text: 'Hello from my instant voice.',
      voiceId: 'voice_1',
    };

    function httpFailure(
      status: number,
      error: Record<string, string> = {},
      headers: Record<string, string> = {},
    ) {
      return throwError(() =>
        Object.assign(new Error(`status ${status}`), {
          isAxiosError: true,
          response: { data: { error }, headers, status },
        }),
      );
    }

    beforeEach(() => {
      vi.spyOn(
        service as unknown as { delay: (ms: number) => Promise<void> },
        'delay',
      ).mockResolvedValue(undefined);
    });

    it('posts heygen-voice-1 to the synchronous TTS endpoint and counts billable characters', async () => {
      httpServiceMock.post.mockReturnValueOnce(
        of({
          data: {
            data: {
              audio_url: 'https://files.heygen.ai/generated/model-speech.wav',
              duration: 3.42,
            },
          },
          status: 200,
        }),
      );

      await expect(
        service.generateSpeech({
          ...speechRequest,
          expressivenessBoost: 0.5,
          language: 'en',
        }),
      ).resolves.toEqual({
        audioUrl: 'https://files.heygen.ai/generated/model-speech.wav',
        characters: 28,
        duration: 3.42,
      });
      expect(httpServiceMock.post).toHaveBeenCalledWith(
        'https://api.heygen.com/v3/models/audio/tts',
        {
          expressiveness_boost: 0.5,
          language: 'en',
          model: 'heygen-voice-1',
          text: 'Hello from my instant voice.',
          voice_id: 'voice_1',
        },
        expect.objectContaining({
          headers: expect.objectContaining({ 'X-Api-Key': 'test-api-key' }),
        }),
      );
    });

    it('leaves out a duration HeyGen does not report', async () => {
      httpServiceMock.post.mockReturnValueOnce(
        of({
          data: { data: { audio_url: 'https://files.heygen.ai/a.wav' } },
          status: 200,
        }),
      );

      const result = await service.generateSpeech(speechRequest);

      expect(result).not.toHaveProperty('duration');
    });

    it('refuses an audio url that is not https', async () => {
      httpServiceMock.post.mockReturnValueOnce(
        of({
          data: { data: { audio_url: 'http://files.heygen.ai/a.wav' } },
          status: 200,
        }),
      );

      await expect(service.generateSpeech(speechRequest)).rejects.toThrow(
        'no https audio url',
      );
    });

    it('rejects text over 5,000 characters and empty text before calling HeyGen', async () => {
      await expect(
        service.generateSpeech({ ...speechRequest, text: 'a'.repeat(5001) }),
      ).rejects.toThrow('at most 5000 characters');
      await expect(
        service.generateSpeech({ ...speechRequest, text: '   ' }),
      ).rejects.toThrow('requires text');
      expect(httpServiceMock.post).not.toHaveBeenCalled();
    });

    it('retries 503 and then succeeds', async () => {
      httpServiceMock.post
        .mockReturnValueOnce(httpFailure(503, { code: 'service_unavailable' }))
        .mockReturnValueOnce(
          of({
            data: { data: { audio_url: 'https://files.heygen.ai/a.wav' } },
            status: 200,
          }),
        );

      await expect(
        service.generateSpeech(speechRequest),
      ).resolves.toMatchObject({ audioUrl: 'https://files.heygen.ai/a.wav' });
      expect(httpServiceMock.post).toHaveBeenCalledTimes(2);
    });

    it('stops after three attempts on a persistent 502', async () => {
      httpServiceMock.post.mockReturnValue(
        httpFailure(502, { code: 'voice_provider_error' }),
      );

      await expect(service.generateSpeech(speechRequest)).rejects.toThrow(
        'unavailable',
      );
      expect(httpServiceMock.post).toHaveBeenCalledTimes(3);
    });

    it('never retries a dropped connection, because the charge is ambiguous', async () => {
      httpServiceMock.post.mockReturnValue(
        throwError(() =>
          Object.assign(new Error('timeout'), { code: 'ECONNABORTED' }),
        ),
      );

      await expect(service.generateSpeech(speechRequest)).rejects.toThrow(
        'timeout',
      );
      expect(httpServiceMock.post).toHaveBeenCalledTimes(1);
    });

    it.each([
      [402, 'insufficient_credit', HeyGenSubmissionRejectedError],
      [404, 'voice_not_found', NotFoundException],
      [409, 'voice_not_ready', ConflictException],
      [400, 'invalid_parameter', BadRequestException],
    ])('maps a %i %s response without retrying', async (status, code, type) => {
      httpServiceMock.post.mockReturnValue(httpFailure(status, { code }));

      await expect(
        service.generateSpeech(speechRequest),
      ).rejects.toBeInstanceOf(type);
      expect(httpServiceMock.post).toHaveBeenCalledTimes(1);
    });

    it('tells the caller how long to wait on a 429', async () => {
      httpServiceMock.post.mockReturnValue(
        httpFailure(
          429,
          { code: 'rate_limit_exceeded' },
          { 'retry-after': '12' },
        ),
      );

      await expect(service.generateSpeech(speechRequest)).rejects.toThrow(
        'Retry after 12 seconds',
      );
      expect(httpServiceMock.post).toHaveBeenCalledTimes(1);
    });
  });
});
