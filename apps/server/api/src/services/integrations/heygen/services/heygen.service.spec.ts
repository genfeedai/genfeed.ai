import { ConfigService } from '@api/config/config.service';
import { ApiKeyHelperService } from '@api/services/api-key/api-key-helper.service';
import { HeyGenService } from '@api/services/integrations/heygen/services/heygen.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { Test, TestingModule } from '@nestjs/testing';
import { of } from 'rxjs';

describe('HeyGenService', () => {
  let service: HeyGenService;

  const configMock = {
    get: vi.fn(() => 'test'),
    isDevelopment: false,
  } as unknown as ConfigService;

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
        data: { data: [] },
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
        { provide: ConfigService, useValue: configMock },
        { provide: LoggerService, useValue: loggerMock },
        { provide: ApiKeyHelperService, useValue: apiKeyHelperMock },
        { provide: HttpService, useValue: httpServiceMock },
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

  it('creates an avatar', async () => {
    const id = await service.createAvatar('name', 'url');
    expect(id).toBe('123');
    expect(httpServiceMock.post).toHaveBeenCalled();
  });

  it('finds all voices', async () => {
    httpServiceMock.get.mockReturnValueOnce(
      of({
        data: { data: { voices: [{ preview_url: 'p', voice_name: 'n' }] } },
        status: 200,
      }),
    );

    const res = await service.getVoices();
    expect(res).toEqual([
      { index: 0, name: 'n', preview: 'p', voiceId: 'voice_0' },
    ]);
    expect(httpServiceMock.get).toHaveBeenCalled();
  });

  it('finds all avatars', async () => {
    httpServiceMock.get.mockReturnValueOnce(
      of({
        data: { data: { avatars: [{ avatar_name: 'n', preview_url: 'p' }] } },
        status: 200,
      }),
    );

    const res = await service.getAvatars();
    expect(res).toEqual([
      { avatarId: 'avatar_0', index: 0, name: 'n', preview: 'p' },
    ]);
    expect(httpServiceMock.get).toHaveBeenCalled();
  });
});
