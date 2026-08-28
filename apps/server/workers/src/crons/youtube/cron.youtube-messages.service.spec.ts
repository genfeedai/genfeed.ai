import { LoggerService } from '@libs/logger/logger.service';
import { PrismaService } from '@libs/prisma/prisma.service';
import { SocialInboxService } from '@server/collections/social-inbox/services/social-inbox.service';
import { WorkflowExecutionQueueService } from '@server/collections/workflows/services/workflow-execution-queue.service';
import {
  SYSTEM_WORKFLOW_ACTION_IDS,
  type SystemWorkflowActionExecutor,
  SystemWorkflowRunnerService,
} from '@server/collections/workflows/system-workflow-runner.service';
import { CronYoutubeMessagesService } from '@workers/crons/youtube/cron.youtube-messages.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('CronYoutubeMessagesService', () => {
  const logger = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };
  const prisma = { credential: { findMany: vi.fn() } };
  const socialInbox = { ingestYoutubeComments: vi.fn() };
  let actionExecutor: SystemWorkflowActionExecutor;
  const runner = {
    registerAction: vi.fn(
      (_actionId: string, executor: SystemWorkflowActionExecutor) => {
        actionExecutor = executor;
      },
    ),
  };
  const queue = {
    queueSystemAction: vi.fn(
      async (input: {
        inputValues?: Record<string, unknown>;
        organizationId: string;
      }) =>
        actionExecutor({
          context: { organizationId: input.organizationId } as never,
          input: input.inputValues ?? {},
          provenance: {
            executionId: 'execution-1',
            workflowId: 'workflow-1',
            workflowLabel: 'Ingest YouTube Comments',
          },
        }),
    ),
  };
  let service: CronYoutubeMessagesService;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.credential.findMany.mockResolvedValue([
      {
        brandId: 'brand-1',
        id: 'credential-1',
        organizationId: 'org-1',
      },
    ]);
    socialInbox.ingestYoutubeComments.mockResolvedValue({
      conversationsCreated: 1,
      messagesCreated: 2,
    });
    service = new CronYoutubeMessagesService(
      logger as unknown as LoggerService,
      prisma as unknown as PrismaService,
      socialInbox as unknown as SocialInboxService,
      runner as unknown as SystemWorkflowRunnerService,
      queue as unknown as WorkflowExecutionQueueService,
    );
    service.onModuleInit();
  });

  it('queues one action-backed workflow per connected credential', async () => {
    await service.syncYoutubeMessages();

    expect(queue.queueSystemAction).toHaveBeenCalledWith(
      expect.objectContaining({
        canonicalId: SYSTEM_WORKFLOW_ACTION_IDS.YOUTUBE_COMMENTS_INGEST,
        inputValues: {
          brandId: 'brand-1',
          credentialId: 'credential-1',
        },
        organizationId: 'org-1',
      }),
      expect.any(String),
    );
    expect(socialInbox.ingestYoutubeComments).toHaveBeenCalledWith(
      { brandId: 'brand-1', organizationId: 'org-1' },
      { credentialId: 'credential-1', limit: 25 },
    );
  });

  it('isolates one credential workflow enqueue failure', async () => {
    queue.queueSystemAction.mockRejectedValueOnce(new Error('queue down'));

    await expect(service.syncYoutubeMessages()).resolves.toBeUndefined();

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('credential sync failed'),
      expect.objectContaining({ credentialId: 'credential-1' }),
    );
  });
});
