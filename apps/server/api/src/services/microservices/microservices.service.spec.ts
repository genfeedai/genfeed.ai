import { ConfigService } from '@api/config/config.service';
import { MicroservicesService } from '@api/services/microservices/microservices.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { HttpException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock Redis client
vi.mock('redis', () => ({
  createClient: vi.fn(() => ({
    connect: vi.fn(),
    disconnect: vi.fn(),
    on: vi.fn(),
    ping: vi.fn(),
    removeAllListeners: vi.fn(),
  })),
}));

// Mock readline
vi.mock('readline', () => ({
  createInterface: vi.fn(() => ({
    close: vi.fn(),
    question: vi.fn((_question, callback) => {
      callback('y'); // Mock user input
    }),
  })),
}));

describe('MicroservicesService', () => {
  let service: MicroservicesService;
  let httpService: HttpService;
  let configService: ConfigService;
  let loggerService: LoggerService;

  beforeEach(async () => {
    const mockHttpService = {
      get: vi.fn(),
      post: vi.fn(),
    };

    const mockConfigService = {
      get: vi.fn((key: string, defaultValue?: string) => {
        const config: Record<string, string> = {
          GENFEEDAI_MICROSERVICES_FILES_URL: 'http://files.genfeed.ai',
          GENFEEDAI_MICROSERVICES_MCP_URL: 'http://mcp.genfeed.ai',
          GENFEEDAI_MICROSERVICES_NOTIFICATIONS_URL:
            'http://notifications.genfeed.ai',
          NODE_ENV: 'development',
          REDIS_URL: 'redis://localhost:6379',
        };
        return config[key] || defaultValue;
      }),
    };

    const mockLoggerService = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MicroservicesService,
        {
          provide: HttpService,
          useValue: mockHttpService,
        },
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

    service = module.get<MicroservicesService>(MicroservicesService);
    httpService = module.get<HttpService>(HttpService);
    configService = module.get<ConfigService>(ConfigService);
    loggerService = module.get<LoggerService>(LoggerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('checkRedisHealth', () => {
    it('should return true when Redis is healthy', async () => {
      const mockRedisClient = {
        ping: vi.fn().mockResolvedValue('PONG'),
      };
      // Access private field via type casting
      (service as unknown as { redisClient: unknown }).redisClient =
        mockRedisClient;

      const result = await service.checkRedisHealth();

      expect(result).toBe(true);
      expect(mockRedisClient.ping).toHaveBeenCalled();
    });

    it('should return false when Redis is unhealthy', async () => {
      const mockRedisClient = {
        ping: vi.fn().mockRejectedValue(new Error('Connection failed')),
      };
      (service as unknown as { redisClient: unknown }).redisClient =
        mockRedisClient;

      const result = await service.checkRedisHealth();

      expect(result).toBe(false);
      expect(loggerService.error).toHaveBeenCalledWith(
        'Redis health check failed',
        expect.any(Error),
      );
    });
  });

  describe('checkServiceHealth', () => {
    it('should return healthy status for successful health check', async () => {
      const mockResponse = { status: 200 };
      vi.spyOn(httpService, 'get').mockReturnValue(of(mockResponse));

      const result = await service.checkServiceHealth(
        'files',
        'http://files.genfeed.ai',
      );

      expect(result).toEqual({
        name: 'files',
        responseTime: expect.any(Number),
        status: 'healthy',
        url: 'http://files.genfeed.ai',
      });

      expect(httpService.get).toHaveBeenCalledWith(
        'http://files.genfeed.ai/v1/health',
        expect.objectContaining({
          timeout: 5000,
          validateStatus: expect.any(Function),
        }),
      );
    });

    it('should return unhealthy status for failed health check', async () => {
      const error = new Error('Service unavailable');
      vi.spyOn(httpService, 'get').mockReturnValue(throwError(() => error));

      const result = await service.checkServiceHealth(
        'files',
        'http://files.genfeed.ai',
      );

      expect(result).toEqual({
        error: 'Service unavailable',
        name: 'files',
        responseTime: expect.any(Number),
        status: 'unhealthy',
        url: 'http://files.genfeed.ai',
      });
    });
  });

  describe('checkAllServices', () => {
    it('should check all configured services', async () => {
      // Initialize services first (normally done in onModuleInit)
      (
        service as unknown as {
          initializeServices: () => void;
        }
      ).initializeServices();

      const mockResponse = { status: 200 };
      vi.spyOn(httpService, 'get').mockReturnValue(of(mockResponse));

      const result = await service.checkAllServices();

      expect(result).toHaveLength(3);
      const names = result.map((r) => r.name).sort();
      expect(names).toEqual(['files', 'mcp', 'notifications']);
    });
  });

  describe('verifyRequiredServices', () => {
    it('should pass verification when all services are healthy in development', async () => {
      const mockRedisClient = {
        ping: vi.fn().mockResolvedValue('PONG'),
      };
      (service as unknown as { redisClient: unknown }).redisClient =
        mockRedisClient;

      // Initialize services
      (
        service as unknown as {
          initializeServices: () => void;
        }
      ).initializeServices();

      await expect(service.verifyRequiredServices()).resolves.not.toThrow();
      // In development mode, skips microservice health checks
      expect(loggerService.log).toHaveBeenCalledWith(
        expect.stringContaining('Skipping microservice health checks'),
      );
    });

    it('should throw exception when Redis is unhealthy', async () => {
      const mockRedisClient = {
        ping: vi.fn().mockRejectedValue(new Error('Connection failed')),
      };
      (service as unknown as { redisClient: unknown }).redisClient =
        mockRedisClient;

      (
        service as unknown as {
          initializeServices: () => void;
        }
      ).initializeServices();

      await expect(service.verifyRequiredServices()).rejects.toThrow(
        HttpException,
      );
      expect(loggerService.error).toHaveBeenCalledWith(
        'Redis is not available. Redis is required for all environments.',
        expect.any(String),
      );
    });

    it('should throw exception in production when services are unhealthy', async () => {
      // verifyRequiredServices retries 5 times with exponential backoff (2+4+8+16s = 30s)
      // Use fake timers to avoid the actual delays
      vi.useFakeTimers();

      const mockRedisClient = {
        ping: vi.fn().mockResolvedValue('PONG'),
      };
      (service as unknown as { redisClient: unknown }).redisClient =
        mockRedisClient;

      vi.spyOn(configService, 'get').mockImplementation((key: string) => {
        if (key === 'NODE_ENV') {
          return 'production';
        }
        return 'http://files.genfeed.ai';
      });

      // Re-initialize with mocked config
      (
        service as unknown as {
          initializeServices: () => void;
        }
      ).initializeServices();

      const error = new Error('Service unavailable');
      vi.spyOn(httpService, 'get').mockReturnValue(throwError(() => error));

      const verifyPromise = service.verifyRequiredServices();

      // Attach rejection handler BEFORE advancing timers to avoid unhandled rejection
      const expectation = expect(verifyPromise).rejects.toThrow(HttpException);

      // Advance through all retry delays (2+4+8+16s) so the loop completes
      await vi.runAllTimersAsync();

      await expectation;
      expect(loggerService.error).toHaveBeenCalledWith(
        expect.stringContaining('Required services are not available'),
        expect.any(Object),
      );

      vi.useRealTimers();
    });
  });

  describe('notifyWebhook', () => {
    it('should send webhook notification successfully', async () => {
      const mockRedisClient = {
        ping: vi.fn().mockResolvedValue('PONG'),
      };
      (service as unknown as { redisClient: unknown }).redisClient =
        mockRedisClient;

      (
        service as unknown as {
          initializeServices: () => void;
        }
      ).initializeServices();

      const mockResponse = { status: 200 };
      vi.spyOn(httpService, 'get').mockReturnValue(of(mockResponse));
      vi.spyOn(httpService, 'post').mockReturnValue(of(mockResponse));

      const notificationData = {
        data: { userId: '123' },
        event: 'user.created',
        service: 'api',
      };

      await service.notifyWebhook('api', 'user.created', notificationData);

      expect(httpService.post).toHaveBeenCalledWith(
        'http://notifications.genfeed.ai/webhooks/notify',
        expect.objectContaining({
          data: notificationData,
          event: 'user.created',
          metadata: expect.objectContaining({
            timestamp: expect.any(String),
          }),
          service: 'api',
          status: 'received',
        }),
        expect.objectContaining({
          timeout: 5000,
        }),
      );
    });

    it('should skip notification in development when service is unhealthy', async () => {
      const mockRedisClient = {
        ping: vi.fn().mockResolvedValue('PONG'),
      };
      (service as unknown as { redisClient: unknown }).redisClient =
        mockRedisClient;

      (
        service as unknown as {
          initializeServices: () => void;
        }
      ).initializeServices();

      const error = new Error('Service unavailable');
      vi.spyOn(httpService, 'get').mockReturnValue(throwError(() => error));

      await service.notifyWebhook('api', 'user.created', {});

      expect(loggerService.warn).toHaveBeenCalledWith(
        expect.stringContaining(
          'notifications service unhealthy in development, skipping',
        ),
      );
    });

    it('should throw error in production when notifications service is unhealthy', async () => {
      const mockRedisClient = {
        ping: vi.fn().mockResolvedValue('PONG'),
      };
      (service as unknown as { redisClient: unknown }).redisClient =
        mockRedisClient;

      vi.spyOn(configService, 'get').mockImplementation((key: string) => {
        if (key === 'NODE_ENV') {
          return 'production';
        }
        return 'http://notifications.genfeed.ai';
      });

      (
        service as unknown as {
          initializeServices: () => void;
        }
      ).initializeServices();

      const error = new Error('Service unavailable');
      vi.spyOn(httpService, 'get').mockReturnValue(throwError(() => error));

      await expect(
        service.notifyWebhook('api', 'user.created', {}),
      ).rejects.toThrow('Notifications service is required but not available');
    });
  });

  describe('uploadToFilesService', () => {
    it('should upload file to files service successfully', async () => {
      const mockRedisClient = {
        ping: vi.fn().mockResolvedValue('PONG'),
      };
      (service as unknown as { redisClient: unknown }).redisClient =
        mockRedisClient;

      (
        service as unknown as {
          initializeServices: () => void;
        }
      ).initializeServices();

      const mockResponse = { status: 200 };
      vi.spyOn(httpService, 'get').mockReturnValue(of(mockResponse));
      vi.spyOn(httpService, 'post').mockReturnValue(
        of({ data: { key: 'file123', url: 'https://example.com/file.jpg' } }),
      );

      const fileData = {
        buffer: Buffer.from('test file content'),
        filename: 'test.jpg',
        metadata: { userId: '123' },
        mimeType: 'image/jpeg',
      };

      const result = await service.uploadToFilesService(fileData);

      expect(result).toEqual({
        key: 'file123',
        url: 'https://example.com/file.jpg',
      });
      expect(httpService.post).toHaveBeenCalledWith(
        'http://files.genfeed.ai/v1/files/upload',
        expect.any(FormData),
        expect.objectContaining({
          headers: {
            'Content-Type': 'multipart/form-data',
          },
          timeout: 30000,
        }),
      );
    });

    it('should throw error when files service URL is not configured', async () => {
      vi.spyOn(configService, 'get').mockReturnValue(undefined);

      // Re-initialize with undefined URLs so servicesConfig has no files entry
      (
        service as unknown as {
          servicesConfig: Map<string, { url: string; required: boolean }>;
        }
      ).servicesConfig = new Map();

      const fileData = {
        buffer: Buffer.from('test file content'),
        filename: 'test.jpg',
        mimeType: 'image/jpeg',
      };

      await expect(service.uploadToFilesService(fileData)).rejects.toThrow(
        'Files service URL not configured',
      );
    });
  });

  describe('getHealthStatus', () => {
    it('should return comprehensive health status', async () => {
      const mockRedisClient = {
        ping: vi.fn().mockResolvedValue('PONG'),
      };
      (service as unknown as { redisClient: unknown }).redisClient =
        mockRedisClient;

      (
        service as unknown as {
          initializeServices: () => void;
        }
      ).initializeServices();

      const mockResponse = { status: 200 };
      vi.spyOn(httpService, 'get').mockReturnValue(of(mockResponse));

      const result = await service.getHealthStatus();

      expect(result).toEqual({
        redis: true,
        services: expect.arrayContaining([
          expect.objectContaining({ name: 'files' }),
          expect.objectContaining({ name: 'mcp' }),
          expect.objectContaining({ name: 'notifications' }),
        ]),
        timestamp: expect.any(String),
      });
    });
  });

  describe('onModuleDestroy', () => {
    it('should disconnect Redis client', async () => {
      const mockRedisClient = {
        disconnect: vi.fn(),
        removeAllListeners: vi.fn(),
      };
      (service as unknown as { redisClient: unknown }).redisClient =
        mockRedisClient;

      await service.onModuleDestroy();

      expect(mockRedisClient.removeAllListeners).toHaveBeenCalled();
      expect(mockRedisClient.disconnect).toHaveBeenCalled();
    });
  });
});
