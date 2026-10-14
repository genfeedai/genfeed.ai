import { SOCIAL_INBOX_SYNC_WORKFLOW_IDS } from '@api/collections/social-inbox/services/social-inbox-sync-workflow-definition';
import { CronYoutubeMessagesService } from '@workers/crons/youtube/cron.youtube-messages.service';
import { buildYoutubeCommentsSweepDefinition } from '@workers/crons/youtube/youtube-maintenance-workflow-definition';

describe('YouTube comment workflows', () => {
  it('fans connected credentials into comment ingestion workflows', () => {
    expect(
      buildYoutubeCommentsSweepDefinition().definition.nodes[1]?.data.config,
    ).toMatchObject({
      actionId: 'workflow.for-each-tenant',
      parameters: {
        childWorkflowId: SOCIAL_INBOX_SYNC_WORKFLOW_IDS.YOUTUBE_COMMENTS,
      },
    });
  });
});

describe('CronYoutubeMessagesService.syncYoutubeMessages', () => {
  function createService(credentials: unknown[]) {
    const prisma = {
      credential: { findMany: vi.fn().mockResolvedValue(credentials) },
    };
    const workflowQueue = {
      queueSystemWorkflow: vi.fn().mockResolvedValue('job-1'),
    };
    const service = new CronYoutubeMessagesService(
      prisma as never,
      { registerAction: vi.fn(), registerWorkflow: vi.fn() } as never,
      workflowQueue as never,
    );
    return { service, workflowQueue };
  }

  it('queues nothing when no connected YouTube credential exists (#5634)', async () => {
    const { service, workflowQueue } = createService([]);

    await service.syncYoutubeMessages();

    expect(workflowQueue.queueSystemWorkflow).not.toHaveBeenCalled();
  });

  it('queues an hour-bucketed sweep when a connected credential exists', async () => {
    const { service, workflowQueue } = createService([
      { brandId: 'brand-1', id: 'cred-1', organizationId: 'org-1' },
    ]);

    await service.syncYoutubeMessages();

    expect(workflowQueue.queueSystemWorkflow).toHaveBeenCalledOnce();
    expect(workflowQueue.queueSystemWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'youtube_messages_sweep' }),
      expect.stringMatching(/^youtube-comments-sweep-\d+$/),
      expect.objectContaining({ attempts: 3 }),
    );
  });
});
