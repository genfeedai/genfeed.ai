import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { ReplyBotConfigsService } from '@api/collections/reply-bot-configs/services/reply-bot-configs.service';
import { ReplyBotOrchestratorService } from '@api/services/reply-bot/reply-bot-orchestrator.service';
import {
  BrokenCircuitError,
  ProcessorCircuitBreaker,
} from '@api/shared/utils/circuit-breaker/circuit-breaker.util';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Job } from 'bullmq';

import {
  type ReplyBotPollingJobData,
  ReplyBotPollingProcessor,
} from './reply-bot-polling.processor';

vi.mock('@api/shared/utils/circuit-breaker/circuit-breaker.util', () => {
  const mockExecute = vi.fn();
  return {
    BrokenCircuitError: class BrokenCircuitError extends Error {
      constructor(
        public readonly processorName: string,
        public readonly consecutiveFailures: number,
      ) {
        super(`Circuit open for "${processorName}"`);
        this.name = 'BrokenCircuitError';
      }
    },
    createProcessorCircuitBreaker: vi.fn(() => ({ execute: mockExecute })),
    ProcessorCircuitBreaker: vi.fn(),
  };
});

const makeJob = (data: ReplyBotPollingJobData): Job<ReplyBotPollingJobData> =>
  ({
    data,
    id: 'job-001',
    updateProgress: vi.fn().mockResolvedValue(undefined),
  }) as unknown as Job<ReplyBotPollingJobData>;

describe('ReplyBotPollingProcessor', () => {
  let processor: ReplyBotPollingProcessor;
  let replyBotOrchestratorService: vi.Mocked<ReplyBotOrchestratorService>;
  let credentialsService: vi.Mocked<CredentialsService>;
  let loggerService: vi.Mocked<LoggerService>;
  let circuitExecute: ReturnType<typeof vi.fn>;

  const orgId = '507f191e810c19729de860ee'.toString();
  const credentialId = '507f191e810c19729de860ee'.toString();

  const mockCredential = {
    _id: '507f191e810c19729de860ee',
    accessToken: 'access-token',
    accessTokenSecret: 'access-secret',
    externalId: 'ext-123',
    isDeleted: false,
    refreshToken: 'refresh-token',
  };

  beforeEach(async () => {
    const { createProcessorCircuitBreaker } = await import(
      '@api/shared/utils/circuit-breaker/circuit-breaker.util'
    );
    circuitExecute = vi.fn();
    vi.mocked(createProcessorCircuitBreaker).mockReturnValue({
      execute: circuitExecute,
    } as unknown as ProcessorCircuitBreaker);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReplyBotPollingProcessor,
        {
          provide: ReplyBotOrchestratorService,
          useValue: { processOrganizationBots: vi.fn() },
        },
        {
          provide: ReplyBotConfigsService,
          useValue: { findAll: vi.fn() },
        },
        {
          provide: CredentialsService,
          useValue: { findOne: vi.fn() },
        },
        {
          provide: LoggerService,
          useValue: {
            error: vi.fn(),
            log: vi.fn(),
            warn: vi.fn(),
          },
        },
      ],
    }).compile();

    processor = module.get(ReplyBotPollingProcessor);
    replyBotOrchestratorService = module.get(ReplyBotOrchestratorService);
    credentialsService = module.get(CredentialsService);
    loggerService = module.get(LoggerService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(processor).toBeDefined();
  });

  it('should delegate to circuitBreaker.execute on process()', async () => {
    const job = makeJob({ credentialId, organizationId: orgId });
    circuitExecute.mockResolvedValue({
      botsProcessed: 1,
      errors: 0,
      organizationId: orgId,
      totalDms: 0,
      totalReplies: 2,
    });

    const result = await processor.process(job);

    expect(circuitExecute).toHaveBeenCalledOnce();
    expect(result.organizationId).toBe(orgId);
  });

  it('should throw and warn when BrokenCircuitError is caught', async () => {
    const job = makeJob({ credentialId, organizationId: orgId });
    const bce = new BrokenCircuitError('reply-bot-polling', 5);
    circuitExecute.mockRejectedValue(bce);

    await expect(processor.process(job)).rejects.toThrow(BrokenCircuitError);
    expect(loggerService.warn).toHaveBeenCalledWith(bce.message);
  });

  it('should re-throw non-BrokenCircuitError errors', async () => {
    const job = makeJob({ credentialId, organizationId: orgId });
    circuitExecute.mockRejectedValue(new Error('unexpected'));

    await expect(processor.process(job)).rejects.toThrow('unexpected');
    expect(loggerService.warn).not.toHaveBeenCalled();
  });

  describe('processInternal (via circuitBreaker passthrough)', () => {
    beforeEach(() => {
      // Make circuitExecute call the inner function directly
      circuitExecute.mockImplementation((fn: () => Promise<unknown>) => fn());
    });

    it('should aggregate results from orchestrator', async () => {
      credentialsService.findOne.mockResolvedValue(mockCredential as never);
      replyBotOrchestratorService.processOrganizationBots.mockResolvedValue([
        { dmsSent: 3, errors: 0, repliesSent: 5 },
        { dmsSent: 1, errors: 1, repliesSent: 2 },
      ] as never);

      const job = makeJob({ credentialId, organizationId: orgId });
      const result = await processor.process(job);

      expect(result.botsProcessed).toBe(2);
      expect(result.totalReplies).toBe(7);
      expect(result.totalDms).toBe(4);
      expect(result.errors).toBe(1);
    });

    it('should throw when credential is not found', async () => {
      credentialsService.findOne.mockResolvedValue(null as never);

      const job = makeJob({ credentialId, organizationId: orgId });
      await expect(processor.process(job)).rejects.toThrow(
        `Credential ${credentialId} not found`,
      );
    });

    it('should pass correct credential data to orchestrator', async () => {
      credentialsService.findOne.mockResolvedValue(mockCredential as never);
      replyBotOrchestratorService.processOrganizationBots.mockResolvedValue([]);

      const job = makeJob({ credentialId, organizationId: orgId });
      await processor.process(job);

      expect(
        replyBotOrchestratorService.processOrganizationBots,
      ).toHaveBeenCalledWith(
        orgId,
        expect.objectContaining({
          accessToken: mockCredential.accessToken,
          accessTokenSecret: mockCredential.accessTokenSecret,
          externalId: mockCredential.externalId,
          refreshToken: mockCredential.refreshToken,
        }),
      );
    });

    it('should call updateProgress at 10, 30, and 100', async () => {
      credentialsService.findOne.mockResolvedValue(mockCredential as never);
      replyBotOrchestratorService.processOrganizationBots.mockResolvedValue([]);

      const job = makeJob({ credentialId, organizationId: orgId });
      await processor.process(job);

      expect(job.updateProgress).toHaveBeenCalledWith(10);
      expect(job.updateProgress).toHaveBeenCalledWith(30);
      expect(job.updateProgress).toHaveBeenCalledWith(100);
    });

    it('should log error and re-throw when orchestrator fails', async () => {
      credentialsService.findOne.mockResolvedValue(mockCredential as never);
      replyBotOrchestratorService.processOrganizationBots.mockRejectedValue(
        new Error('orchestrator down'),
      );

      const job = makeJob({ credentialId, organizationId: orgId });
      await expect(processor.process(job)).rejects.toThrow('orchestrator down');
      expect(loggerService.error).toHaveBeenCalledWith(
        expect.stringContaining('failed'),
        expect.anything(),
      );
    });

    it('should return zero totals when orchestrator returns empty array', async () => {
      credentialsService.findOne.mockResolvedValue(mockCredential as never);
      replyBotOrchestratorService.processOrganizationBots.mockResolvedValue([]);

      const job = makeJob({ credentialId, organizationId: orgId });
      const result = await processor.process(job);

      expect(result.botsProcessed).toBe(0);
      expect(result.totalReplies).toBe(0);
      expect(result.totalDms).toBe(0);
      expect(result.errors).toBe(0);
    });
  });
});
