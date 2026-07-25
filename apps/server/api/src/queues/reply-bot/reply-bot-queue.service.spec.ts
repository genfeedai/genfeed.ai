import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
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

interface MockReplyBotConfigsService {
  findActive: ReturnType<typeof vi.fn>;
  findAllActive: ReturnType<typeof vi.fn>;
}

interface MockCredentialsService {
  find: ReturnType<typeof vi.fn>;
  findOne: ReturnType<typeof vi.fn>;
}

interface MockLoggerService {
  debug: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
  log: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
}

describe('ReplyBotQueueService', () => {
  let service: ReplyBotQueueService;
  let mockQueue: MockQueue;
  let replyBotConfigsService: MockReplyBotConfigsService;
  let credentialsService: MockCredentialsService;
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

    const mockCredentials: MockCredentialsService = {
      find: vi.fn().mockResolvedValue([]),
      findOne: vi.fn().mockResolvedValue(null),
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
        { provide: CredentialsService, useValue: mockCredentials },
        { provide: LoggerService, useValue: mockLogger },
      ],
    }).compile();

    service = module.get<ReplyBotQueueService>(ReplyBotQueueService);
    replyBotConfigsService = module.get(ReplyBotConfigsService);
    credentialsService = module.get(CredentialsService);
    logger = module.get(LoggerService);

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
    const ORG_WITH_CREDENTIAL = 'org-with-credential';
    const ORG_WITHOUT_CREDENTIAL = 'org-without-credential';
    const CREDENTIAL_ID = 'credential-1';

    it('does nothing when no organization has an active bot', async () => {
      replyBotConfigsService.findAllActive.mockResolvedValue([]);

      await service.scheduledPolling();

      expect(credentialsService.find).not.toHaveBeenCalled();
      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('queues one job per organization that has an active bot and a Twitter credential, warns on a missing credential, and never reads credentials for organizations without an active bot', async () => {
      replyBotConfigsService.findAllActive.mockResolvedValue([
        { id: 'config-1', organizationId: ORG_WITH_CREDENTIAL },
        // Second active config for the same org must not produce a second job.
        { id: 'config-2', organizationId: ORG_WITH_CREDENTIAL },
        { id: 'config-3', organizationId: ORG_WITHOUT_CREDENTIAL },
      ]);

      credentialsService.find.mockResolvedValue([
        { id: CREDENTIAL_ID, organizationId: ORG_WITH_CREDENTIAL },
      ]);

      await service.scheduledPolling();

      // Two queries total for the whole tick, regardless of tenant count.
      expect(replyBotConfigsService.findAllActive).toHaveBeenCalledTimes(1);
      expect(credentialsService.find).toHaveBeenCalledTimes(1);
      expect(replyBotConfigsService.findActive).not.toHaveBeenCalled();

      // Only organizations with an active bot reach the credential read. The
      // exact `in` list proves an organization without an active bot — which
      // contributes no config here — is never queried for credentials.
      expect(credentialsService.find).toHaveBeenCalledWith({
        isDeleted: false,
        organizationId: {
          in: [ORG_WITH_CREDENTIAL, ORG_WITHOUT_CREDENTIAL],
        },
        platform: CredentialPlatform.TWITTER,
      });

      // Included: active bot + credential.
      expect(mockQueue.add).toHaveBeenCalledTimes(1);
      expect(mockQueue.add).toHaveBeenCalledWith(
        'poll',
        {
          credentialId: CREDENTIAL_ID,
          organizationId: ORG_WITH_CREDENTIAL,
        },
        expect.any(Object),
      );

      // Excluded + warned: active bot, no credential.
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining(
          `no Twitter credential found for org ${ORG_WITHOUT_CREDENTIAL}`,
        ),
      );
    });

    it('keeps the first credential when an organization has several', async () => {
      replyBotConfigsService.findAllActive.mockResolvedValue([
        { id: 'config-1', organizationId: ORG_WITH_CREDENTIAL },
      ]);
      credentialsService.find.mockResolvedValue([
        { id: CREDENTIAL_ID, organizationId: ORG_WITH_CREDENTIAL },
        { id: 'credential-2', organizationId: ORG_WITH_CREDENTIAL },
      ]);

      await service.scheduledPolling();

      expect(mockQueue.add).toHaveBeenCalledTimes(1);
      expect(mockQueue.add).toHaveBeenCalledWith(
        'poll',
        {
          credentialId: CREDENTIAL_ID,
          organizationId: ORG_WITH_CREDENTIAL,
        },
        expect.any(Object),
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
