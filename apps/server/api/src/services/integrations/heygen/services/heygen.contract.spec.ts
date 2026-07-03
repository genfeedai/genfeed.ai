import { ConfigService } from '@api/config/config.service';
import { ApiKeyHelperService } from '@api/services/api-key/api-key-helper.service';
import { HeyGenService } from '@api/services/integrations/heygen/services/heygen.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { Test, type TestingModule } from '@nestjs/testing';
import { of, throwError } from 'rxjs';

/**
 * Contract tests for the HeyGen integration (avatar-video revenue path).
 *
 * These pin the outgoing request payload shape sent to the HeyGen v2 REST API
 * and the response shape the service parses back (`data.data.video_id`). The
 * `HttpService` is mocked; no network calls are made. Fixtures cover a success
 * response and provider failure shapes (non-200 status, network error).
 *
 * To update when HeyGen changes its API: adjust the `/video/generate` and
 * `/avatar/create` body assertions and the response fixtures below.
 */
describe('HeyGenService (contract)', () => {
  let service: HeyGenService;
  let httpService: {
    get: ReturnType<typeof vi.fn>;
    post: ReturnType<typeof vi.fn>;
  };
  let logger: {
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
  };

  const CALLBACK_URL = 'https://webhook.test/v1/webhooks/heygen/callback';

  beforeEach(async () => {
    httpService = { get: vi.fn(), post: vi.fn() };
    logger = { error: vi.fn(), log: vi.fn() };

    const configMock = {
      get: vi.fn((key?: string) => {
        if (key === 'GENFEEDAI_WEBHOOKS_URL') return 'https://webhook.test';
        // HEYGEN_WEBHOOK_SECRET intentionally unset → callback carries no token.
        return undefined;
      }),
    };
    const apiKeyHelperMock = {
      getApiKey: vi.fn().mockReturnValue('heygen-key'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HeyGenService,
        { provide: ConfigService, useValue: configMock },
        { provide: LoggerService, useValue: logger },
        { provide: ApiKeyHelperService, useValue: apiKeyHelperMock },
        { provide: HttpService, useValue: httpService },
      ],
    }).compile();

    service = module.get<HeyGenService>(HeyGenService);
  });

  afterEach(() => vi.clearAllMocks());

  describe('generateAvatarVideo — /video/generate request/response contract', () => {
    it('POSTs the avatar video payload with X-Api-Key and returns data.video_id', async () => {
      // Success fixture: HeyGen returns the queued video id under data.data.
      httpService.post.mockReturnValue(
        of({ data: { data: { video_id: 'vid_abc' } }, status: 200 }),
      );

      const id = await service.generateAvatarVideo(
        'meta_1',
        'avatar_1',
        'voice_1',
        'Hello world',
      );

      expect(id).toBe('vid_abc');
      expect(httpService.post).toHaveBeenCalledWith(
        'https://api.heygen.com/v2/video/generate',
        expect.objectContaining({
          callback_id: 'meta_1',
          callback_url: CALLBACK_URL,
          caption: false,
          dimension: { height: 720, width: 1280 },
          video_inputs: [
            expect.objectContaining({
              character: expect.objectContaining({
                avatar_id: 'avatar_1',
                type: 'avatar',
              }),
              voice: expect.objectContaining({
                input_text: 'Hello world',
                type: 'text',
                voice_id: 'voice_1',
              }),
            }),
          ],
        }),
        {
          headers: {
            'Content-Type': 'application/json',
            'X-Api-Key': 'heygen-key',
          },
        },
      );
    });

    it('falls back to data.task_id when video_id is absent', async () => {
      httpService.post.mockReturnValue(
        of({ data: { data: { task_id: 'task_xyz' } }, status: 200 }),
      );

      const id = await service.generateAvatarVideo('m', 'a', 'v', 'text');
      expect(id).toBe('task_xyz');
    });

    it('throws on a non-200 provider response', async () => {
      // Failure fixture: HeyGen 400 with an error body.
      httpService.post.mockReturnValue(
        of({ data: { error: 'invalid avatar' }, status: 400 }),
      );

      await expect(
        service.generateAvatarVideo('m', 'a', 'v', 'text'),
      ).rejects.toThrow('HeyGen API returned non-200 status');
    });

    it('rethrows and logs on a network/transport error', async () => {
      // Failure fixture: transport-level failure (e.g. 500 → axios throws).
      httpService.post.mockReturnValue(
        throwError(() => ({ response: { data: {}, status: 500 } })),
      );

      await expect(
        service.generateAvatarVideo('m', 'a', 'v', 'text'),
      ).rejects.toBeDefined();
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('generatePhotoAvatarVideo — voice payload contract', () => {
    it('uses an audio voice payload when an audio url is supplied', async () => {
      httpService.post.mockReturnValue(
        of({ data: { data: { video_id: 'vid_photo' } }, status: 200 }),
      );

      const id = await service.generatePhotoAvatarVideo(
        'meta_2',
        'https://p/photo.png',
        {
          audioUrl: 'https://a/audio.mp3',
        },
      );

      expect(id).toBe('vid_photo');
      const [, body] = httpService.post.mock.calls[0];
      expect(body.video_inputs[0].character).toEqual({
        photo_url: 'https://p/photo.png',
        type: 'photo_avatar',
      });
      expect(body.video_inputs[0].voice).toEqual({
        audio_url: 'https://a/audio.mp3',
        type: 'audio',
      });
    });

    it('rejects when neither audio url nor voice id is supplied', async () => {
      await expect(
        service.generatePhotoAvatarVideo('meta_3', 'https://p/photo.png', {}),
      ).rejects.toThrow(/audioUrl or voiceId is required/i);
    });
  });

  describe('createAvatar — /avatar/create request/response contract', () => {
    it('POSTs avatar_name + video_url and returns data.avatar_id', async () => {
      httpService.post.mockReturnValue(
        of({ data: { data: { avatar_id: 'av_new' } }, status: 200 }),
      );

      const id = await service.createAvatar('My Avatar', 'https://v/clip.mp4');

      expect(id).toBe('av_new');
      expect(httpService.post).toHaveBeenCalledWith(
        'https://api.heygen.com/v2/avatar/create',
        expect.objectContaining({
          avatar_name: 'My Avatar',
          video_url: 'https://v/clip.mp4',
        }),
        {
          headers: {
            'Content-Type': 'application/json',
            'X-Api-Key': 'heygen-key',
          },
        },
      );
    });
  });
});
