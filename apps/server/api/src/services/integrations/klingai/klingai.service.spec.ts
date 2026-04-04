import { ConfigService } from '@api/config/config.service';
import { KlingAIService } from '@api/services/integrations/klingai/klingai.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { Test, TestingModule } from '@nestjs/testing';
import { of, throwError } from 'rxjs';

vi.mock('@helpers/utils/jwt/jwt.util', () => ({
  encodeJwtToken: vi.fn(() => 'token'),
}));

describe('KlingAIService', () => {
  let service: KlingAIService;
  let mockHttpService: { post: ReturnType<typeof vi.fn> };

  const configMock = {
    get: vi.fn(() => 'test'),
    ingredientsEndpoint: 'https://api.test.com/ingredients',
    webhooksUrl: 'https://api.test.com/webhooks',
  } as unknown as ConfigService;

  const loggerMock = {
    error: vi.fn(),
    log: vi.fn(),
  } as unknown as LoggerService;

  beforeEach(async () => {
    mockHttpService = {
      post: vi.fn().mockReturnValue(
        of({
          data: { request_id: '123' },
          status: 200,
        }),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KlingAIService,
        { provide: ConfigService, useValue: configMock },
        { provide: LoggerService, useValue: loggerMock },
        { provide: HttpService, useValue: mockHttpService },
      ],
    }).compile();

    service = module.get<KlingAIService>(KlingAIService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('generates an image', async () => {
    mockHttpService.post.mockReturnValueOnce(
      of({
        data: { request_id: '123' },
        status: 200,
      }),
    );

    const id = await service.generateImage('prompt', {
      height: 1024,
      model: 'kling-v2',
      style: 'anime',
      width: 1024,
    });

    expect(id).toBe('123');
    expect(mockHttpService.post).toHaveBeenCalled();
  });

  it('generates a video from text', async () => {
    mockHttpService.post.mockReturnValueOnce(
      of({
        data: { request_id: '123' },
        status: 200,
      }),
    );

    const id = await service.generateTextToVideo('prompt');

    expect(id).toBe('123');
    expect(mockHttpService.post).toHaveBeenCalled();
  });

  it('throws authorization error when api responds 401', async () => {
    mockHttpService.post.mockReturnValueOnce(
      throwError(() => ({ response: { data: {}, status: 401 } })),
    );

    await expect(service.generateImage('prompt')).rejects.toThrow(
      'KlingAI authorization failed',
    );
  });
});
