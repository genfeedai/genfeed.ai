const { ec2SendMock } = vi.hoisted(() => ({
  ec2SendMock: vi.fn(),
}));

vi.mock('@aws-sdk/client-ec2', () => ({
  DescribeInstancesCommand: class DescribeInstancesCommand {},
  EC2Client: class EC2Client {
    send = ec2SendMock;
  },
  StartInstancesCommand: class StartInstancesCommand {},
  StopInstancesCommand: class StopInstancesCommand {},
}));

vi.mock('axios', () => ({
  default: {
    get: vi.fn(),
  },
}));

import { ConfigService } from '@api/config/config.service';
import {
  LLM_LAST_REQUEST_KEY,
  LlmInstanceService,
} from '@api/services/integrations/llm/llm-instance.service';
import { PollUntilService } from '@api/shared/services/poll-until/poll-until.service';
import { LoggerService } from '@libs/logger/logger.service';
import { RedisService } from '@libs/redis/redis.service';
import { Test, TestingModule } from '@nestjs/testing';

const mockPollUntilProvider = {
  provide: PollUntilService,
  useValue: { poll: vi.fn() },
};

describe('LlmInstanceService', () => {
  let service: LlmInstanceService;
  let configGetMock: ReturnType<typeof vi.fn>;
  let redisGetMock: ReturnType<typeof vi.fn>;
  let redisSetMock: ReturnType<typeof vi.fn>;

  const loggerMock = {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  } as unknown as LoggerService;

  const makeConfig = (overrides: Record<string, string> = {}) => {
    const defaults: Record<string, string> = {
      AWS_ACCESS_KEY_ID: 'test-key-id',
      AWS_REGION: 'us-east-1',
      AWS_SECRET_ACCESS_KEY: 'test-secret',
      GPU_LLM_INSTANCE_ID: 'i-1234567890abcdef0',
      GPU_LLM_URL: 'http://10.0.0.10:8000',
      ...overrides,
    };
    return vi.fn((key: string) => defaults[key] ?? '');
  };

  beforeEach(async () => {
    ec2SendMock.mockReset();
    redisGetMock = vi.fn();
    redisSetMock = vi.fn();

    configGetMock = makeConfig();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LlmInstanceService,
        mockPollUntilProvider,
        {
          provide: ConfigService,
          useValue: { get: configGetMock },
        },
        {
          provide: LoggerService,
          useValue: loggerMock,
        },
        {
          provide: RedisService,
          useValue: {
            getPublisher: vi.fn(() => ({
              get: redisGetMock,
              set: redisSetMock,
            })),
          },
        },
      ],
    }).compile();

    service = module.get<LlmInstanceService>(LlmInstanceService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('ensureRunning', () => {
    it('should be a no-op when GPU_LLM_INSTANCE_ID is not configured', async () => {
      configGetMock.mockImplementation((key: string) => {
        if (key === 'GPU_LLM_INSTANCE_ID') return '';
        return 'value';
      });

      // Rebuild with empty config
      const module = await Test.createTestingModule({
        providers: [
          LlmInstanceService,
          mockPollUntilProvider,
          { provide: ConfigService, useValue: { get: configGetMock } },
          { provide: LoggerService, useValue: loggerMock },
          {
            provide: RedisService,
            useValue: {
              getPublisher: vi.fn(() => ({
                get: redisGetMock,
                set: redisSetMock,
              })),
            },
          },
        ],
      }).compile();

      const svc = module.get<LlmInstanceService>(LlmInstanceService);
      await svc.ensureRunning();

      expect(ec2SendMock).not.toHaveBeenCalled();
      expect(loggerMock.warn).toHaveBeenCalled();
    });

    it('should touch last request when instance is already running', async () => {
      vi.spyOn(service as never, 'getInstanceState').mockResolvedValue(
        'running',
      );
      redisSetMock.mockResolvedValue('OK');

      await service.ensureRunning();

      expect(redisSetMock).toHaveBeenCalledWith(
        LLM_LAST_REQUEST_KEY,
        expect.any(String),
        { EX: 3600 },
      );
      expect(ec2SendMock).not.toHaveBeenCalled();
    });

    it('should start instance when it is stopped, then wait for health', async () => {
      vi.spyOn(service as never, 'getInstanceState').mockResolvedValue(
        'stopped',
      );
      vi.spyOn(service as never, 'waitForHealth').mockResolvedValue(undefined);
      ec2SendMock.mockResolvedValueOnce({});
      redisSetMock.mockResolvedValue('OK');

      await service.ensureRunning();

      expect(loggerMock.log).toHaveBeenCalledWith(
        expect.stringContaining('Starting LLM instance'),
      );
      expect(ec2SendMock).toHaveBeenCalledTimes(1);
    });

    it('should throw when health check times out', async () => {
      vi.spyOn(service as never, 'getInstanceState').mockResolvedValue(
        'stopped',
      );
      vi.spyOn(service as never, 'waitForHealth').mockRejectedValue(
        new Error('LLM instance failed to become healthy within 90s'),
      );
      ec2SendMock.mockResolvedValueOnce({});

      await expect(service.ensureRunning()).rejects.toThrow(
        'failed to become healthy',
      );
    });
  });

  describe('touchLastRequest', () => {
    it('should set Redis key with EX 3600', async () => {
      redisSetMock.mockResolvedValue('OK');

      await service.touchLastRequest();

      expect(redisSetMock).toHaveBeenCalledWith(
        LLM_LAST_REQUEST_KEY,
        expect.any(String),
        { EX: 3600 },
      );
    });

    it('should be a no-op when redis is null', async () => {
      const module = await Test.createTestingModule({
        providers: [
          LlmInstanceService,
          mockPollUntilProvider,
          { provide: ConfigService, useValue: { get: configGetMock } },
          { provide: LoggerService, useValue: loggerMock },
          {
            provide: RedisService,
            useValue: { getPublisher: vi.fn(() => null) },
          },
        ],
      }).compile();

      const svc = module.get<LlmInstanceService>(LlmInstanceService);
      await expect(svc.touchLastRequest()).resolves.toBeUndefined();
    });
  });

  describe('isIdle', () => {
    it('should return true when no last-request key exists', async () => {
      redisGetMock.mockResolvedValue(null);

      const result = await service.isIdle();

      expect(result).toBe(true);
    });

    it('should return false when last request was very recent', async () => {
      redisGetMock.mockResolvedValue(String(Date.now()));

      const result = await service.isIdle();

      expect(result).toBe(false);
    });

    it('should return true when last request was > 10 minutes ago', async () => {
      const oldTimestamp = Date.now() - 11 * 60 * 1000;
      redisGetMock.mockResolvedValue(String(oldTimestamp));

      const result = await service.isIdle();

      expect(result).toBe(true);
    });

    it('should return false when redis publisher is null', async () => {
      const module = await Test.createTestingModule({
        providers: [
          LlmInstanceService,
          mockPollUntilProvider,
          { provide: ConfigService, useValue: { get: configGetMock } },
          { provide: LoggerService, useValue: loggerMock },
          {
            provide: RedisService,
            useValue: { getPublisher: vi.fn(() => null) },
          },
        ],
      }).compile();

      const svc = module.get<LlmInstanceService>(LlmInstanceService);
      const result = await svc.isIdle();

      expect(result).toBe(false);
    });
  });

  describe('stopInstance', () => {
    it('should stop the instance when instanceId is configured', async () => {
      ec2SendMock.mockResolvedValue({});

      await service.stopInstance();

      expect(ec2SendMock).toHaveBeenCalledTimes(1);
      expect(loggerMock.log).toHaveBeenCalledWith(
        expect.stringContaining('Stopping idle LLM instance'),
      );
    });

    it('should be a no-op when GPU_LLM_INSTANCE_ID is not configured', async () => {
      const emptyConfig = makeConfig({ GPU_LLM_INSTANCE_ID: '' });
      const module = await Test.createTestingModule({
        providers: [
          LlmInstanceService,
          mockPollUntilProvider,
          { provide: ConfigService, useValue: { get: emptyConfig } },
          { provide: LoggerService, useValue: loggerMock },
          {
            provide: RedisService,
            useValue: {
              getPublisher: vi.fn(() => ({
                get: redisGetMock,
                set: redisSetMock,
              })),
            },
          },
        ],
      }).compile();

      const svc = module.get<LlmInstanceService>(LlmInstanceService);
      await svc.stopInstance();

      expect(ec2SendMock).not.toHaveBeenCalled();
    });

    it('should log error but not throw when stop command fails', async () => {
      ec2SendMock.mockRejectedValue(new Error('EC2 error'));

      await expect(service.stopInstance()).resolves.toBeUndefined();
      expect(loggerMock.error).toHaveBeenCalled();
    });
  });
});
