import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { ReplyBotConfigsService } from '@api/collections/reply-bot-configs/services/reply-bot-configs.service';
import { ReplyBotQueueService } from '@api/queues/reply-bot/reply-bot-queue.service';
import { CredentialPlatform } from '@genfeedai/enums';
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

interface MockOrgsService {
  findAll: ReturnType<typeof vi.fn>;
}

interface MockReplyBotConfigsService {
  findActive: ReturnType<typeof vi.fn>;
}

interface MockCredentialsService {
  findOne: ReturnType<typeof vi.fn>;
}

describe('ReplyBotQueueService', () => {
  let service: ReplyBotQueueService;
  let mockQueue: MockQueue;
  let orgsService: MockOrgsService;
  let replyBotConfigsService: MockReplyBotConfigsService;
  let credentialsService: MockCredentialsService;

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

    const mockOrgs: MockOrgsService = {
      findAll: vi.fn().mockResolvedValue({ docs: [] }),
    };

    const mockReplyBotConfigs: MockReplyBotConfigsService = {
      findActive: vi.fn().mockResolvedValue([]),
    };

    const mockCredentials: MockCredentialsService = {
      findOne: vi.fn().mockResolvedValue(null),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReplyBotQueueService,
        { provide: getQueueToken('reply-bot-polling'), useValue: mockQueue },
        { provide: OrganizationsService, useValue: mockOrgs },
        { provide: ReplyBotConfigsService, useValue: mockReplyBotConfigs },
        { provide: CredentialsService, useValue: mockCredentials },
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

    service = module.get<ReplyBotQueueService>(ReplyBotQueueService);
    orgsService = module.get(OrganizationsService);
    replyBotConfigsService = module.get(ReplyBotConfigsService);
    credentialsService = module.get(CredentialsService);

    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ── onModuleInit ─────────────────────────────────────────────────────

  describe('onModuleInit', () => {
    it('logs initialization without throwing', () => {
      expect(() => service.onModuleInit()).not.toThrow();
    });
  });

  // ── triggerPolling ───────────────────────────────────────────────────

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

  // ── scheduledPolling ─────────────────────────────────────────────────

  describe('scheduledPolling', () => {
    it('does nothing when no organizations have active bots', async () => {
      orgsService.findAll.mockResolvedValue({ docs: [] });

      await service.scheduledPolling();

      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('queues jobs for organizations with active bots and credentials', async () => {
      const orgId1 = '507f191e810c19729de860ee';
      const orgId2 = '507f191e810c19729de860ee';
      const credId = '507f191e810c19729de860ee';

      orgsService.findAll.mockResolvedValue({
        docs: [{ _id: orgId1 }, { _id: orgId2 }],
      });

      replyBotConfigsService.findActive
        .mockResolvedValueOnce([{ _id: 'config-1' }]) // org1 has active bots
        .mockResolvedValueOnce([]); // org2 does not

      credentialsService.findOne.mockResolvedValueOnce({
        _id: credId,
      });

      await service.scheduledPolling();

      expect(mockQueue.add).toHaveBeenCalledTimes(1);
      expect(mockQueue.add).toHaveBeenCalledWith(
        'poll',
        {
          credentialId: credId.toString(),
          organizationId: orgId1.toString(),
        },
        expect.any(Object),
      );
    });

    it('skips organizations without Twitter credentials', async () => {
      const orgId1 = '507f191e810c19729de860ee';
      orgsService.findAll.mockResolvedValue({
        docs: [{ _id: orgId1 }],
      });
      replyBotConfigsService.findActive.mockResolvedValue([
        { _id: 'config-1' },
      ]);
      credentialsService.findOne.mockResolvedValue(null);

      await service.scheduledPolling();

      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('looks up Twitter credentials specifically', async () => {
      const orgId1 = '507f191e810c19729de860ee';
      orgsService.findAll.mockResolvedValue({
        docs: [{ _id: orgId1 }],
      });
      replyBotConfigsService.findActive.mockResolvedValue([{ _id: 'c-1' }]);
      credentialsService.findOne.mockResolvedValue(null);

      await service.scheduledPolling();

      expect(credentialsService.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          isDeleted: false,
          organization: orgId1,
          platform: CredentialPlatform.TWITTER,
        }),
      );
    });
  });

  // ── getQueueStatus ───────────────────────────────────────────────────

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

  // ── pausePolling / resumePolling ─────────────────────────────────────

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
