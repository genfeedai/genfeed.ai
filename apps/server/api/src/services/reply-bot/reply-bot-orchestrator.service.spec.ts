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
import { SocialMonitorService } from '@api/services/reply-bot/social-monitor.service';
import { ConfigService } from '@libs/config/config.service';
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
  let service: ReplyBotOrchestratorService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        ReplyBotOrchestratorService,
        { provide: ConfigService, useValue: {} },
        { provide: LoggerService, useValue: { error: vi.fn() } },
        { provide: SocialMonitorService, useValue: {} },
        { provide: ReplyGenerationService, useValue: {} },
        { provide: BotActionExecutorService, useValue: {} },
        { provide: RateLimitService, useValue: {} },
        { provide: ReplyCandidatePrefilterService, useValue: {} },
        { provide: ReplyBotConfigsService, useValue: {} },
        { provide: MonitoredAccountsService, useValue: {} },
        { provide: BotActivitiesService, useValue: {} },
        { provide: ProcessedTweetsService, useValue: {} },
        { provide: CredentialsService, useValue: {} },
        { provide: SystemWorkflowRunnerService, useValue: workflowRunner },
        { provide: WorkflowExecutionQueueService, useValue: workflowQueue },
        { provide: AuthorReplyLoopService, useValue: {} },
      ],
    }).compile();
    service = module.get(ReplyBotOrchestratorService);
    vi.clearAllMocks();
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
