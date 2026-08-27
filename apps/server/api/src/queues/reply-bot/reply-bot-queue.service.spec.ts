import { ReplyBotConfigsService } from '@server/collections/reply-bot-configs/services/reply-bot-configs.service';
import {
  ReplyBotQueueService,
  readReplyBotCredentialId,
} from '@api/queues/reply-bot/reply-bot-queue.service';
import { LoggerService } from '@libs/logger/logger.service';
import { getQueueToken } from '@nestjs/bullmq';
import { Test, type TestingModule } from '@nestjs/testing';

interface MockQueue {
  add: ReturnType<typeof vi.fn>;
  getActiveCount: ReturnType<typeof vi.fn>;
  getCompletedCount: ReturnType<typeof vi.fn>;
  getFailedCount: ReturnType<typeof vi.fn>;
  getWaitingCount: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
  resume: ReturnType<typeof vi.fn>;
}

interface MockReplyBotConfigsService {
  findActive: ReturnType<typeof vi.fn>;
  findAllActive: ReturnType<typeof vi.fn>;
}

interface MockLoggerService {
  debug: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
  log: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
}

describe('readReplyBotCredentialId', () => {
  it('reads root credentialId first', () => {
    expect(
      readReplyBotCredentialId({
        config: { credentialId: 'nested' },
        credentialId: 'root',
      }),
    ).toBe('root');
  });

  it('falls back to nested config.credentialId', () => {
    expect(
      readReplyBotCredentialId({
        config: { credentialId: 'nested' },
      }),
    ).toBe('nested');
  });

  it('returns undefined when neither path has a credential', () => {
    expect(readReplyBotCredentialId({ config: {} })).toBeUndefined();
    expect(readReplyBotCredentialId({})).toBeUndefined();
  });
});

describe('ReplyBotQueueService', () => {
  let service: ReplyBotQueueService;
  let mockQueue: MockQueue;
  let replyBotConfigsService: MockReplyBotConfigsService;
  let logger: MockLoggerService;

  beforeEach(async () => {
    mockQueue = {
      add: vi.fn().mockResolvedValue({ id: 'job-1' }),
      getActiveCount: vi.fn().mockResolvedValue(0),
      getCompletedCount: vi.fn().mockResolvedValue(0),
      getFailedCount: vi.fn().mockResolvedValue(0),
      getWaitingCount: vi.fn().mockResolvedValue(0),
      pause: vi.fn().mockResolvedValue(undefined),
      resume: vi.fn().mockResolvedValue(undefined),
    };

    const mockReplyBotConfigs: MockReplyBotConfigsService = {
      findActive: vi.fn().mockResolvedValue([]),
      findAllActive: vi.fn().mockResolvedValue([]),
    };

    const mockLogger: MockLoggerService = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReplyBotQueueService,
        { provide: getQueueToken('reply-bot-polling'), useValue: mockQueue },
        { provide: ReplyBotConfigsService, useValue: mockReplyBotConfigs },
        { provide: LoggerService, useValue: mockLogger },
      ],
    }).compile();

    service = module.get<ReplyBotQueueService>(ReplyBotQueueService);
    replyBotConfigsService = module.get(ReplyBotConfigsService);
    logger = module.get(LoggerService);

    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('onModuleInit', () => {
    it('logs initialization without throwing', () => {
      expect(() => service.onModuleInit()).not.toThrow();
    });
  });

  describe('triggerPolling', () => {
    it('queues a polling job and returns job ID', async () => {
      mockQueue.add.mockResolvedValue({ id: 'job-42' });

      const jobId = await service.triggerPolling('org-1', 'cred-1');

      expect(jobId).toBe('job-42');
      expect(mockQueue.add).toHaveBeenCalledWith(
        'poll',
        { credentialId: 'cred-1', organizationId: 'org-1' },
        expect.objectContaining({
          removeOnComplete: 100,
          removeOnFail: 50,
        }),
      );
    });

    it('re-throws when queue.add fails', async () => {
      mockQueue.add.mockRejectedValue(new Error('Redis down'));

      await expect(service.triggerPolling('org-1', 'cred-1')).rejects.toThrow(
        'Redis down',
      );
    });
  });

  describe('scheduledPolling', () => {
    it('does nothing when no organization has an active bot', async () => {
      replyBotConfigsService.findAllActive.mockResolvedValue([]);

      await service.scheduledPolling();

      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('queues one job per bound credential and skips configs without credentialId', async () => {
      replyBotConfigsService.findAllActive.mockResolvedValue([
        {
          credentialId: 'cred-twitter',
          id: 'config-1',
          organizationId: 'org-1',
          platform: 'twitter',
        },
        // Same credential twice → one job
        {
          config: { credentialId: 'cred-twitter' },
          id: 'config-2',
          organizationId: 'org-1',
          platform: 'twitter',
        },
        {
          credentialId: 'cred-youtube',
          id: 'config-3',
          organizationId: 'org-1',
          platform: 'youtube',
        },
        {
          id: 'config-4',
          organizationId: 'org-2',
          platform: 'twitter',
        },
      ]);

      await service.scheduledPolling();

      expect(replyBotConfigsService.findAllActive).toHaveBeenCalledTimes(1);
      expect(mockQueue.add).toHaveBeenCalledTimes(2);
      expect(mockQueue.add).toHaveBeenCalledWith(
        'poll',
        {
          credentialId: 'cred-twitter',
          organizationId: 'org-1',
        },
        expect.any(Object),
      );
      expect(mockQueue.add).toHaveBeenCalledWith(
        'poll',
        {
          credentialId: 'cred-youtube',
          organizationId: 'org-1',
        },
        expect.any(Object),
      );
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('missing credentialId'),
        expect.objectContaining({ organizationId: 'org-2' }),
      );
    });

    it('queues nothing when the active-bot lookup fails', async () => {
      replyBotConfigsService.findAllActive.mockRejectedValue(
        new Error('Postgres down'),
      );

      await expect(service.scheduledPolling()).resolves.toBeUndefined();

      expect(mockQueue.add).not.toHaveBeenCalled();
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('getQueueStatus', () => {
    it('returns all queue counts', async () => {
      mockQueue.getWaitingCount.mockResolvedValue(3);
      mockQueue.getActiveCount.mockResolvedValue(1);
      mockQueue.getCompletedCount.mockResolvedValue(42);
      mockQueue.getFailedCount.mockResolvedValue(2);

      const status = await service.getQueueStatus();

      expect(status).toEqual({
        active: 1,
        completed: 42,
        failed: 2,
        waiting: 3,
      });
    });
  });

  describe('pausePolling', () => {
    it('pauses the queue', async () => {
      await service.pausePolling();
      expect(mockQueue.pause).toHaveBeenCalled();
    });
  });

  describe('resumePolling', () => {
    it('resumes the queue', async () => {
      await service.resumePolling();
      expect(mockQueue.resume).toHaveBeenCalled();
    });
  });
});
