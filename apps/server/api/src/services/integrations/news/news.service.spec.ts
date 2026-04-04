import { ConfigService } from '@api/config/config.service';
import { NewsService } from '@api/services/integrations/news/news.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { Test, TestingModule } from '@nestjs/testing';
import { of, throwError } from 'rxjs';

describe('NewsService', () => {
  let service: NewsService;
  let mockHttpService: { get: ReturnType<typeof vi.fn> };

  const configMock = {
    get: vi.fn(() => 'test'),
  } as unknown as ConfigService;

  const loggerMock = {
    error: vi.fn(),
    log: vi.fn(),
  } as unknown as LoggerService;

  beforeEach(async () => {
    mockHttpService = {
      get: vi.fn().mockReturnValue(of({ data: { articles: [] } })),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NewsService,
        { provide: ConfigService, useValue: configMock },
        { provide: LoggerService, useValue: loggerMock },
        { provide: HttpService, useValue: mockHttpService },
      ],
    }).compile();

    service = module.get<NewsService>(NewsService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('gets latest news', async () => {
    mockHttpService.get.mockReturnValueOnce(
      of({ data: { articles: [{ title: 'a' }] } }),
    );
    const res = await service.findLatestNews('test');

    expect(res).toEqual(['a']);
    expect(mockHttpService.get).toHaveBeenCalled();
  });

  it('returns empty array when request fails', async () => {
    mockHttpService.get.mockReturnValueOnce(
      throwError(() => new Error('fail')),
    );
    const res = await service.findLatestNews('topic');

    expect(res).toEqual([]);
    expect(loggerMock.error).toHaveBeenCalled();
  });

  it('uses config values for api url', () => {
    // apiUrl and apiKey are private, accessed via type assertion
    expect((service as unknown as Record<string, string>).apiUrl).toBe('test');
    expect((service as unknown as Record<string, string>).apiKey).toBe('test');
  });
});
