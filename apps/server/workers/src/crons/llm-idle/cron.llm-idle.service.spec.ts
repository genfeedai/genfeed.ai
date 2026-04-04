import { LoggerService } from '@libs/logger/logger.service';
import { RedisService } from '@libs/redis/redis.service';
import { Test, type TestingModule } from '@nestjs/testing';
import { ConfigService } from '@workers/config/config.service';
import { CronLlmIdleService } from '@workers/crons/llm-idle/cron.llm-idle.service';

const mockEC2Send = vi.fn();

vi.mock('@aws-sdk/client-ec2', () => {
  class MockDescribeInstancesCommand {
    constructor(public readonly input: unknown) {}
  }
  class MockStopInstancesCommand {
    constructor(public readonly input: unknown) {}
  }
  class MockEC2Client {
    send(...args: unknown[]) {
      return mockEC2Send(...args);
    }
  }
  return {
    DescribeInstancesCommand: MockDescribeInstancesCommand,
    EC2Client: MockEC2Client,
    StopInstancesCommand: MockStopInstancesCommand,
  };
});

vi.mock('@api/helpers/utils/error/get-error-message.util', () => ({
  getErrorMessage: vi.fn((e: unknown) =>
    e instanceof Error ? e.message : String(e),
  ),
}));

describe('CronLlmIdleService', () => {
  let service: CronLlmIdleService;

  const mockRedisPublisher = {
    get: vi.fn(),
  };

  const mockRedisService = {
    getPublisher: vi.fn().mockReturnValue(mockRedisPublisher),
  };

  const mockLoggerService = {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  const mockConfigService = {
    get: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    mockConfigService.get.mockImplementation((key: string) => {
      const config: Record<string, string> = {
        AWS_ACCESS_KEY_ID: 'AKIATEST',
        AWS_REGION: 'us-east-1',
        AWS_SECRET_ACCESS_KEY: 'secret',
        GPU_LLM_INSTANCE_ID: 'i-1234567890abcdef0',
      };
      return config[key];
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CronLlmIdleService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: RedisService, useValue: mockRedisService },
        { provide: LoggerService, useValue: mockLoggerService },
      ],
    }).compile();

    service = module.get<CronLlmIdleService>(CronLlmIdleService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('shutdownIfIdle', () => {
    it('should skip if GPU_LLM_INSTANCE_ID is not configured', async () => {
      mockConfigService.get.mockReturnValue(undefined);

      const moduleNoInstance: TestingModule = await Test.createTestingModule({
        providers: [
          CronLlmIdleService,
          { provide: ConfigService, useValue: mockConfigService },
          { provide: RedisService, useValue: mockRedisService },
          { provide: LoggerService, useValue: mockLoggerService },
        ],
      }).compile();

      const s = moduleNoInstance.get<CronLlmIdleService>(CronLlmIdleService);
      await s.shutdownIfIdle();

      expect(mockEC2Send).not.toHaveBeenCalled();
    });

    it('should not stop instance when last request is recent', async () => {
      // Recent activity — within 10 minute idle window
      mockRedisPublisher.get.mockResolvedValue(String(Date.now() - 60_000));

      await service.shutdownIfIdle();

      expect(mockEC2Send).not.toHaveBeenCalled();
    });

    it('should not stop instance when it is already stopped', async () => {
      // Idle (no recent request)
      mockRedisPublisher.get.mockResolvedValue(null);

      // Instance state = stopped
      mockEC2Send.mockResolvedValueOnce({
        Reservations: [{ Instances: [{ State: { Name: 'stopped' } }] }],
      });

      await service.shutdownIfIdle();

      // describe called once, StopInstances NOT called
      expect(mockEC2Send).toHaveBeenCalledTimes(1);
    });

    it('should stop instance when idle and running', async () => {
      // Idle (last request >10 minutes ago)
      mockRedisPublisher.get.mockResolvedValue(
        String(Date.now() - 15 * 60 * 1000),
      );

      // Describe: running; Stop: success
      mockEC2Send
        .mockResolvedValueOnce({
          Reservations: [{ Instances: [{ State: { Name: 'running' } }] }],
        })
        .mockResolvedValueOnce({});

      await service.shutdownIfIdle();

      expect(mockEC2Send).toHaveBeenCalledTimes(2);
      expect(mockLoggerService.log).toHaveBeenCalledWith(
        expect.stringContaining('stopped successfully'),
      );
    });

    it('should treat missing redis key as idle', async () => {
      mockRedisPublisher.get.mockResolvedValue(null);

      mockEC2Send
        .mockResolvedValueOnce({
          Reservations: [{ Instances: [{ State: { Name: 'running' } }] }],
        })
        .mockResolvedValueOnce({});

      await service.shutdownIfIdle();

      expect(mockEC2Send).toHaveBeenCalledTimes(2);
    });

    it('should log error when EC2 stop fails', async () => {
      mockRedisPublisher.get.mockResolvedValue(
        String(Date.now() - 20 * 60 * 1000),
      );

      mockEC2Send
        .mockResolvedValueOnce({
          Reservations: [{ Instances: [{ State: { Name: 'running' } }] }],
        })
        .mockRejectedValueOnce(new Error('EC2 error'));

      await service.shutdownIfIdle();

      expect(mockLoggerService.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to stop'),
        expect.any(Object),
      );
    });

    it('should return unknown state when DescribeInstances call fails', async () => {
      mockRedisPublisher.get.mockResolvedValue(null);
      mockEC2Send.mockRejectedValueOnce(new Error('Describe failed'));

      // With unknown state, should not try to stop
      await service.shutdownIfIdle();

      // Only called once (describe failed, stop never issued)
      expect(mockEC2Send).toHaveBeenCalledTimes(1);
    });

    it('should not stop instance when redis publisher is unavailable', async () => {
      mockRedisService.getPublisher.mockReturnValueOnce(null);

      await service.shutdownIfIdle();

      expect(mockEC2Send).not.toHaveBeenCalled();
    });
  });
});
