import { SocialInboxService } from '@api/collections/social-inbox/services/social-inbox.service';
import { SocialInboxSyncWorkflowService } from '@api/collections/social-inbox/services/social-inbox-sync-workflow.service';
import { buildSocialInboxSyncWorkflowDefinition } from '@api/collections/social-inbox/services/social-inbox-sync-workflow-definition';
import type { WorkflowExecutionQueueService } from '@api/collections/workflows/services/workflow-execution-queue.service';
import type { SystemWorkflowRunnerService } from '@api/collections/workflows/system-workflow-runner.service';
import { Platform, SocialConversationType } from '@genfeedai/contracts';
import { describe, expect, it, vi } from 'vitest';

const SURFACES = [
  [Platform.YOUTUBE, SocialConversationType.COMMENT],
  [Platform.INSTAGRAM, SocialConversationType.COMMENT],
  [Platform.INSTAGRAM, SocialConversationType.DM],
  [Platform.TWITTER, SocialConversationType.COMMENT],
  [Platform.TWITTER, SocialConversationType.DM],
  [Platform.LINKEDIN, SocialConversationType.COMMENT],
  [Platform.LINKEDIN, SocialConversationType.DM],
] as const;

function createService() {
  const registeredWorkflows: string[] = [];
  const workflowRunner = {
    registerAction: vi.fn(),
    registerWorkflow: vi.fn((definition: { canonicalId: string }) => {
      registeredWorkflows.push(definition.canonicalId);
    }),
  };
  const workflowQueue = {
    queueSystemWorkflow: vi.fn().mockResolvedValue('job-1'),
  };
  const socialInboxService = {
    ingestInstagramComments: vi.fn(),
    ingestInstagramDms: vi.fn(),
    ingestLinkedInComments: vi.fn(),
    ingestLinkedInDms: vi.fn(),
    ingestXComments: vi.fn(),
    ingestXDms: vi.fn(),
    ingestYoutubeComments: vi.fn(),
  };
  const service = new SocialInboxSyncWorkflowService(
    socialInboxService as unknown as SocialInboxService,
    workflowRunner as unknown as SystemWorkflowRunnerService,
    workflowQueue as unknown as WorkflowExecutionQueueService,
  );

  return { registeredWorkflows, service, workflowQueue, workflowRunner };
}

describe('SocialInboxSyncWorkflowService', () => {
  it('registers a workflow for every surface the sync endpoints can enqueue', () => {
    const { registeredWorkflows, service } = createService();

    service.onModuleInit();

    expect([...registeredWorkflows].sort()).toEqual(
      SURFACES.map(
        ([platform, conversationType]) =>
          buildSocialInboxSyncWorkflowDefinition(platform, conversationType)
            .canonicalId,
      ).sort(),
    );
  });

  it.each(SURFACES)(
    'queues %s %s under a canonical id the worker can resolve',
    async (platform, conversationType) => {
      const { registeredWorkflows, service, workflowQueue } = createService();
      service.onModuleInit();

      await service.enqueue({
        conversationType,
        organizationId: 'org-1',
        platform,
        userId: 'user-1',
      });

      const queued = workflowQueue.queueSystemWorkflow.mock.calls[0]?.[0] as {
        canonicalId: string;
      };
      expect(registeredWorkflows).toContain(queued.canonicalId);
    },
  );
});
