import { SOCIAL_INBOX_SYNC_WORKFLOW_IDS } from '@api/collections/social-inbox/services/social-inbox-sync-workflow-definition';
import { CredentialPlatform as PrismaCredentialPlatform } from '@genfeedai/prisma';
import { CronYoutubeMessagesService } from '@workers/crons/youtube/cron.youtube-messages.service';
import {
  buildYoutubeCommentsSweepDefinition,
  YOUTUBE_MAINTENANCE_ACTION_IDS,
} from '@workers/crons/youtube/youtube-maintenance-workflow-definition';

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
      credential: {
        findMany: vi
          .fn()
          .mockImplementation(async ({ take }: { take?: number }) =>
            take === undefined ? credentials : credentials.slice(0, take),
          ),
      },
    };
    const workflowQueue = {
      queueSystemWorkflow: vi.fn().mockResolvedValue('job-1'),
    };
    const workflowRunner = {
      registerAction: vi.fn(),
      registerWorkflow: vi.fn(),
    };
    const service = new CronYoutubeMessagesService(
      prisma as never,
      workflowRunner as never,
      workflowQueue as never,
    );
    return { service, workflowQueue, prisma, workflowRunner };
  }

  const credentials = [
    { brandId: 'brand-1', id: 'cred-1', organizationId: 'org-1' },
    { brandId: 'brand-2', id: 'cred-2', organizationId: 'org-2' },
    { brandId: 'brand-3', id: 'cred-3', organizationId: 'org-3' },
  ];
  const discoveryQuery = {
    select: { brandId: true, id: true, organizationId: true },
    where: {
      brandId: { not: null },
      isConnected: true,
      isDeleted: false,
      organizationId: { not: null },
      platform: PrismaCredentialPlatform.YOUTUBE,
    },
  };

  it('bounds the existence preflight to one credential with the complete unchanged eligibility filter', async () => {
    const { service, prisma, workflowQueue } = createService(credentials);
    await service.syncYoutubeMessages();
    expect(prisma.credential.findMany).toHaveBeenCalledExactlyOnceWith({
      ...discoveryQuery,
      take: 1,
    });
    expect(workflowQueue.queueSystemWorkflow).toHaveBeenCalledOnce();
  });

  it('keeps registered discovery complete after a bounded preflight so every account reaches fan-out', async () => {
    const { service, prisma, workflowRunner } = createService(credentials);
    service.onModuleInit();
    await service.syncYoutubeMessages();
    const discover = workflowRunner.registerAction.mock.calls.find(
      ([id]) => id === YOUTUBE_MAINTENANCE_ACTION_IDS.DISCOVER_CREDENTIALS,
    )?.[1];
    if (!discover) throw new Error('Missing registered credential discovery');
    expect(await discover()).toEqual({
      items: credentials.map(({ brandId, id, organizationId }) => ({
        brandId,
        credentialId: id,
        organizationId,
      })),
    });
    expect(prisma.credential.findMany).toHaveBeenCalledTimes(2);
    expect(prisma.credential.findMany.mock.calls[0]?.[0]).toEqual({
      ...discoveryQuery,
      take: 1,
    });
    expect(prisma.credential.findMany.mock.calls[1]?.[0]).toEqual(
      discoveryQuery,
    );
  });

  it('propagates a failed existence query without enqueueing a sweep', async () => {
    const { service, prisma, workflowQueue } = createService(credentials);
    const error = new Error('credential query failed');
    prisma.credential.findMany.mockRejectedValueOnce(error);
    await expect(service.syncYoutubeMessages()).rejects.toBe(error);
    expect(workflowQueue.queueSystemWorkflow).not.toHaveBeenCalled();
  });

  it('preserves queue failure propagation after a nonempty preflight', async () => {
    const { service, workflowQueue } = createService(credentials);
    const error = new Error('queue failed');
    workflowQueue.queueSystemWorkflow.mockRejectedValueOnce(error);
    await expect(service.syncYoutubeMessages()).rejects.toBe(error);
  });

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
