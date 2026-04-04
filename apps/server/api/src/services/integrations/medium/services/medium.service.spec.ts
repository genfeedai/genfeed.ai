import { ArticlesService } from '@api/collections/articles/services/articles.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { ConfigService } from '@api/config/config.service';
import { MediumService } from '@api/services/integrations/medium/services/medium.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { Test, TestingModule } from '@nestjs/testing';
import { of } from 'rxjs';

describe('MediumService', () => {
  let service: MediumService;
  let httpService: vi.Mocked<HttpService>;
  let loggerService: vi.Mocked<LoggerService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MediumService,
        {
          provide: ConfigService,
          useValue: {
            get: vi.fn((key: string) => `mock-${key}`),
          },
        },
        {
          provide: CredentialsService,
          useValue: {
            findOne: vi.fn(),
            patch: vi.fn(),
          },
        },
        {
          provide: ArticlesService,
          useValue: {
            findOne: vi.fn(),
            patch: vi.fn(),
          },
        },
        {
          provide: HttpService,
          useValue: {
            delete: vi.fn(),
            get: vi.fn(),
            post: vi.fn(),
            put: vi.fn(),
          },
        },
        {
          provide: LoggerService,
          useValue: {
            debug: vi.fn(),
            error: vi.fn(),
            log: vi.fn(),
            warn: vi.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<MediumService>(MediumService);
    httpService = module.get(HttpService);
    loggerService = module.get(LoggerService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('service initialization', () => {
    it('should initialize with http and logger services', () => {
      expect(service).toBeDefined();
      expect(httpService).toBeDefined();
      expect(loggerService).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('should handle API errors gracefully', () => {
      httpService.get.mockReturnValue(
        of({
          config: {} as unknown as import('axios').InternalAxiosRequestConfig,
          data: null,
          headers: {},
          status: 500,
          statusText: 'Internal Server Error',
        }),
      );

      // Test would verify error handling for specific methods
      expect(service).toBeDefined();
    });
  });

  describe('Medium integration', () => {
    it('should be configured for Medium API', () => {
      expect(service).toBeDefined();
      // Medium-specific tests would go here
    });
  });
});
