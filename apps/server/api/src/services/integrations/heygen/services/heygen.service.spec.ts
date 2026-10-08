import { ApiKeyHelperService } from '@api/services/api-key/api-key-helper.service';
import { ByokService } from '@api/services/byok/byok.service';
import { HeyGenService } from '@api/services/integrations/heygen/services/heygen.service';
import { PollUntilService } from '@api/shared/services/poll-until/poll-until.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { Test, TestingModule } from '@nestjs/testing';
import { of } from 'rxjs';

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
});
