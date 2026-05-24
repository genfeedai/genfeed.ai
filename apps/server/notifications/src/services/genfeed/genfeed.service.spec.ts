import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';
import { ConfigService } from '@notifications/config/config.service';
import { GenFeedService } from '@notifications/services/genfeed/genfeed.service';
import axios from 'axios';
import { beforeEach, describe, expect, it, type Mocked, vi } from 'vitest';

// Mock axios
vi.mock('axios');
const mockedAxios = axios as Mocked<typeof axios>;

describe('GenFeedService', () => {
  let service: GenFeedService;

  const mockConfigService = {
    get: vi.fn((key: string) => {
      const config: Record<string, string> = {
        GENFEEDAI_API_KEY: 'test-api-key',
        GENFEEDAI_API_URL: 'https://api.genfeed.ai',
      };
      return config[key];
    }),
  };

  const mockLoggerService = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  beforeEach(async () => {
    // Mock axios.create
    mockedAxios.create = vi.fn().mockReturnValue({
      delete: vi.fn(),
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GenFeedService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: LoggerService,
          useValue: mockLoggerService,
        },
      ],
    }).compile();

    service = module.get<GenFeedService>(GenFeedService);
    module.get<ConfigService>(ConfigService);
    module.get<LoggerService>(LoggerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should initialize with API configuration', () => {
    expect(mockConfigService.get).toHaveBeenCalledWith('GENFEEDAI_API_URL');
    expect(mockConfigService.get).toHaveBeenCalledWith('GENFEEDAI_API_KEY');
  });
});
