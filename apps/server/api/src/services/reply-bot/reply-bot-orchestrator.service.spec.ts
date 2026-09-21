import { BotActivitiesService } from '@api/collections/bot-activities/services/bot-activities.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { MonitoredAccountsService } from '@api/collections/monitored-accounts/services/monitored-accounts.service';
import { ProcessedTweetsService } from '@api/collections/processed-tweets/services/processed-tweets.service';
import { ReplyBotConfigsService } from '@api/collections/reply-bot-configs/services/reply-bot-configs.service';
import { WorkflowExecutionQueueService } from '@api/collections/workflows/services/workflow-execution-queue.service';
import { SystemWorkflowRunnerService } from '@api/collections/workflows/system-workflow-runner.service';
import { AuthorReplyLoopService } from '@api/services/reply-bot/author-reply-loop.service';
import { BotActionExecutorService } from '@api/services/reply-bot/bot-action-executor.service';
import { RateLimitService } from '@api/services/reply-bot/rate-limit.service';
import { ReplyBotOrchestratorService } from '@api/services/reply-bot/reply-bot-orchestrator.service';
import { REPLY_BOT_ACTION_IDS } from '@api/services/reply-bot/reply-bot-workflow-definition';
import { ReplyCandidatePrefilterService } from '@api/services/reply-bot/reply-candidate-prefilter.service';
import { ReplyGenerationService } from '@api/services/reply-bot/reply-generation.service';
import { ReplyIntentClassifierService } from '@api/services/reply-bot/reply-intent-classifier.service';
import { SocialMonitorService } from '@api/services/reply-bot/social-monitor.service';
import {
  BotActivitySkipReason,
  BotActivityStatus,
  ReplyBotType,
} from '@genfeedai/contracts';
import type { IReplyIntentClassification } from '@genfeedai/contracts/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { Test } from '@nestjs/testing';

describe('ReplyBotOrchestratorService workflow boundary', () => {
  const workflowRunner = {
    registerAction: vi.fn(),
    registerWorkflow: vi.fn(),
    runWorkflow: vi.fn(),
  };
  const workflowQueue = {
    queueSystemWorkflow: vi.fn(),
  };
  const replyBotConfigsService = { findOneById: vi.fn() };
  const rateLimitService = { checkRateLimit: vi.fn() };
  const botActivitiesService = { create: vi.fn(), updateStatus: vi.fn() };
  const processedTweetsService = { markAsProcessed: vi.fn() };
  const replyIntentClassifierService = { classify: vi.fn() };
  let service: ReplyBotOrchestratorService;

  const CONTENT_REQUEST = {
    botConfigId: 'bot-1',
    content: {
      authorId: 'author-1',
      authorUsername: 'reader',
      createdAt: new Date().toISOString(),
      id: 'comment-1',
      replyContext: 'How we ship weekly',
      text: 'this is mid garbage cope harder',
    },
    credentialId: 'credential-1',
    organizationId: 'org-1',
  };

  /** Drives the claim action the way the workflow runner would. */
  async function claimContent(
    classification: IReplyIntentClassification,
  ): Promise<Record<string, unknown>> {
    replyBotConfigsService.findOneById.mockResolvedValue({
      brandId: 'brand-1',
      id: 'bot-1',
      type: ReplyBotType.COMMENT_RESPONDER,
      userId: 'user-1',
    });
    rateLimitService.checkRateLimit.mockResolvedValue({ allowed: true });
    botActivitiesService.create.mockResolvedValue({ id: 'activity-1' });
    replyIntentClassifierService.classify.mockResolvedValue(classification);
    service.onModuleInit();
    const claim = workflowRunner.registerAction.mock.calls.find(
      ([actionId]) => actionId === REPLY_BOT_ACTION_IDS.CLAIM_CONTENT,
    )?.[1] as (request: {
      input: Record<string, unknown>;
    }) => Promise<Record<string, unknown>>;

    return claim({ input: { request: CONTENT_REQUEST } });
  }

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        ReplyBotOrchestratorService,
        { provide: LoggerService, useValue: { error: vi.fn() } },
        { provide: SocialMonitorService, useValue: {} },
        { provide: ReplyGenerationService, useValue: {} },
        { provide: BotActionExecutorService, useValue: {} },
        { provide: RateLimitService, useValue: rateLimitService },
        { provide: ReplyCandidatePrefilterService, useValue: {} },
        { provide: ReplyBotConfigsService, useValue: replyBotConfigsService },
        { provide: MonitoredAccountsService, useValue: {} },
        { provide: BotActivitiesService, useValue: botActivitiesService },
        { provide: ProcessedTweetsService, useValue: processedTweetsService },
        { provide: CredentialsService, useValue: {} },
        { provide: SystemWorkflowRunnerService, useValue: workflowRunner },
        { provide: WorkflowExecutionQueueService, useValue: workflowQueue },
        { provide: AuthorReplyLoopService, useValue: {} },
        {
          provide: ReplyIntentClassifierService,
          useValue: replyIntentClassifierService,
        },
      ],
    }).compile();
    service = module.get(ReplyBotOrchestratorService);
    vi.clearAllMocks();
  });

  describe('comment intent gate', () => {
    it('records the decided intent and its confidence on the activity', async () => {
      await claimContent({
        confidence: 0.93,
        intent: 'question',
        isAutoSkip: false,
        isNeedsReview: false,
        source: 'decision',
      });

      expect(botActivitiesService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          intent: 'question',
          intentConfidence: 0.93,
          intentSource: 'decision',
          isIntentNeedsReview: false,
        }),
      );
    });

    it('auto-skips a confident troll and closes the comment out', async () => {
      const state = await claimContent({
        confidence: 0.96,
        intent: 'troll',
        isAutoSkip: true,
        isNeedsReview: false,
        source: 'decision',
      });

      expect(state).toMatchObject({
        skipReason: BotActivitySkipReason.FILTERED_OUT,
        skipped: true,
      });
      expect(processedTweetsService.markAsProcessed).toHaveBeenCalledOnce();
    });

    it('queues an uncertain comment for review without closing it out', async () => {
      const state = await claimContent({
        confidence: 0.5,
        intent: 'troll',
        isAutoSkip: false,
        isNeedsReview: true,
        source: 'regex',
      });

      expect(state).toMatchObject({
        skipReason: BotActivitySkipReason.NEEDS_REVIEW,
        skipped: true,
      });
      expect(botActivitiesService.updateStatus).toHaveBeenCalledWith(
        'activity-1',
        'org-1',
        expect.objectContaining({ status: BotActivityStatus.SKIPPED }),
      );
      // Still unprocessed, so the comment reaches a person in the inbox.
      expect(processedTweetsService.markAsProcessed).not.toHaveBeenCalled();
    });
  });

  it('registers every reusable action and all child workflows', () => {
    service.onModuleInit();

    expect(workflowRunner.registerWorkflow).toHaveBeenCalledTimes(5);
    expect(workflowRunner.registerAction).toHaveBeenCalledTimes(
      Object.keys(REPLY_BOT_ACTION_IDS).length,
    );
  });

  it('passes only organization and credential identifiers into polling', async () => {
    workflowRunner.runWorkflow.mockResolvedValueOnce({
      result: [],
    });

    await service.processOrganizationBots('org-1', 'credential-1');

    expect(workflowRunner.runWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        inputValues: {
          request: {
            credentialId: 'credential-1',
            organizationId: 'org-1',
          },
        },
      }),
    );
  });

  it('queues manual polling as the organization workflow', async () => {
    workflowQueue.queueSystemWorkflow.mockResolvedValueOnce('job-1');

    await expect(
      service.queueOrganizationBots('org-1', 'credential-1'),
    ).resolves.toBe('job-1');

    expect(workflowQueue.queueSystemWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        inputValues: {
          request: {
            credentialId: 'credential-1',
            organizationId: 'org-1',
          },
        },
      }),
      expect.stringMatching(/^reply-bot-poll-org-1-credential-1-/),
    );
  });

  it('routes a single bot through its child workflow', async () => {
    workflowRunner.runWorkflow.mockResolvedValueOnce({
      result: { botConfigId: 'bot-1' },
    });

    await service.processSingleBot('bot-1', 'org-1', 'credential-1');

    expect(workflowRunner.runWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        inputValues: {
          request: {
            botConfigId: 'bot-1',
            credentialId: 'credential-1',
            organizationId: 'org-1',
          },
        },
      }),
    );
  });

  it('routes dry-run generation through a workflow without a provider credential', async () => {
    workflowRunner.runWorkflow.mockResolvedValueOnce({
      result: { replyText: 'draft' },
    });

    await service.testReplyGeneration('bot-1', 'org-1', {
      author: 'alice',
      content: 'hello',
    });

    expect(workflowRunner.runWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        inputValues: {
          request: {
            botConfigId: 'bot-1',
            organizationId: 'org-1',
            testContent: { author: 'alice', content: 'hello' },
          },
        },
      }),
    );
  });
});
