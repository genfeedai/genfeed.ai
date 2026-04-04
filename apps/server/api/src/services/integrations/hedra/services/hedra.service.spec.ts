import { ConfigService } from '@api/config/config.service';
import { ApiKeyHelperService } from '@api/services/api-key/api-key-helper.service';
import { HedraService } from '@api/services/integrations/hedra/services/hedra.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { Test, TestingModule } from '@nestjs/testing';
import { of } from 'rxjs';

describe('HedraService', () => {
  let service: HedraService;
  let postSpy: vi.Mock;
  let getSpy: vi.Mock;

  beforeEach(async () => {
    postSpy = vi.fn();
    getSpy = vi.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HedraService,
        {
          provide: ConfigService,
          useValue: {
            get: vi.fn().mockReturnValue('test-key'),
          },
        },
        {
          provide: LoggerService,
          useValue: {
            error: vi.fn(),
            log: vi.fn(),
            warn: vi.fn(),
          },
        },
        {
          provide: HttpService,
          useValue: {
            get: getSpy.mockReturnValue(of({ data: {}, status: 200 })),
            post: postSpy.mockReturnValue(of({ data: {}, status: 200 })),
          },
        },
        {
          provide: ApiKeyHelperService,
          useValue: {
            getApiKey: vi.fn().mockReturnValue('test-api-key'),
          },
        },
      ],
    }).compile();

    service = module.get<HedraService>(HedraService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('generates character video', async () => {
    postSpy.mockReturnValueOnce(
      of({
        data: { job_id: 'job123' },
        status: 200,
      }),
    );

    const jobId = await service.generateCharacterVideo(
      'meta123',
      'https://example.com/audio.mp3',
      'https://example.com/image.jpg',
    );

    expect(jobId).toBe('job123');
    expect(postSpy).toHaveBeenCalled();
  });

  it('generates character with text', async () => {
    postSpy.mockReturnValueOnce(
      of({
        data: { job_id: 'job456' },
        status: 200,
      }),
    );

    const jobId = await service.generateCharacterWithText(
      'meta456',
      'Hello world',
      'https://example.com/image.jpg',
      'voice123',
    );

    expect(jobId).toBe('job456');
    expect(postSpy).toHaveBeenCalled();
  });

  it('gets voices list', async () => {
    getSpy.mockReturnValueOnce(
      of({
        data: {
          voices: [
            {
              gender: 'female',
              language: 'en-US',
              voice_id: 'v1',
              voice_name: 'Alice',
            },
          ],
        },
        status: 200,
      }),
    );

    const voices = await service.getVoices();

    expect(voices).toEqual([
      {
        gender: 'female',
        id: 'v1',
        language: 'en-US',
        name: 'Alice',
        preview: undefined,
        provider: 'hedra',
      },
    ]);
    expect(getSpy).toHaveBeenCalled();
  });

  it('gets job status', async () => {
    getSpy.mockReturnValueOnce(
      of({
        data: {
          status: 'completed',
          video_url: 'https://example.com/video.mp4',
        },
        status: 200,
      }),
    );

    const status = await service.getJobStatus('job123');

    expect(status).toEqual({
      error: undefined,
      status: 'completed',
      video_url: 'https://example.com/video.mp4',
    });
    expect(getSpy).toHaveBeenCalled();
  });

  it('creates live avatar', async () => {
    postSpy.mockReturnValueOnce(
      of({
        data: { avatar_id: 'avatar789' },
        status: 201,
      }),
    );

    const avatarId = await service.createLiveAvatar(
      'My Avatar',
      'https://example.com/image.jpg',
    );

    expect(avatarId).toBe('avatar789');
    expect(postSpy).toHaveBeenCalled();
  });

  it('gets avatars list', async () => {
    getSpy.mockReturnValueOnce(
      of({
        data: {
          avatars: [
            {
              avatar_id: 'a1',
              avatar_name: 'Avatar 1',
              preview_url: 'https://example.com/preview.jpg',
              type: 'realtime',
            },
          ],
        },
        status: 200,
      }),
    );

    const avatars = await service.getAvatars();

    expect(avatars).toEqual([
      {
        id: 'a1',
        name: 'Avatar 1',
        preview: 'https://example.com/preview.jpg',
        type: 'realtime',
      },
    ]);
    expect(getSpy).toHaveBeenCalled();
  });
});
