import { SocialInboxService } from '@api/collections/social-inbox/services/social-inbox.service';
import { SocialInboxSyncWorkflowService } from '@api/collections/social-inbox/services/social-inbox-sync-workflow.service';
import {
  buildSocialInboxSyncWorkflowDefinition,
  SOCIAL_INBOX_SYNC_ACTION_IDS,
} from '@api/collections/social-inbox/services/social-inbox-sync-workflow-definition';
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
  const registeredActions = new Map<
    string,
    (request: { input: Record<string, unknown> }) => Promise<unknown>
  >();
  const workflowRunner = {
    registerAction: vi.fn(
      (
        actionId: string,
        handler: (request: {
          input: Record<string, unknown>;
        }) => Promise<unknown>,
      ) => {
        registeredActions.set(actionId, handler);
      },
    ),
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

  return {
    registeredActions,
    registeredWorkflows,
    service,
    socialInboxService,
    workflowQueue,
    workflowRunner,
  };
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

  describe('YouTube comment sync result', () => {
    async function runYoutubeSync(
      result: Record<string, unknown>,
      credentialId?: string,
    ) {
      const { registeredActions, service, socialInboxService } =
        createService();
      service.onModuleInit();
      socialInboxService.ingestYoutubeComments.mockResolvedValue(result);
      const action = registeredActions.get(
        SOCIAL_INBOX_SYNC_ACTION_IDS.YOUTUBE_COMMENTS,
      );
      return action?.({
        input: { state: { credentialId, organizationId: 'org-1' } },
      });
    }

    it('returns the scan counters for a sync that read the inbox', async () => {
      const result = {
        commentsSeen: 0,
        conversationsCreated: 0,
        credentialsScanned: 1,
        messagesCreated: 0,
        postFailures: [],
        postsScanned: 0,
      };

      await expect(runYoutubeSync(result)).resolves.toEqual(result);
    });

    it('fails the job when every scanned post failed instead of completing', async () => {
      await expect(
        runYoutubeSync({
          commentsSeen: 0,
          conversationsCreated: 0,
          credentialsScanned: 1,
          messagesCreated: 0,
          postFailures: [
            { errorName: 'Error', message: 'Forbidden', postId: 'p1' },
          ],
          postsScanned: 1,
        }),
      ).rejects.toThrow('failed for all 1 scanned post(s): Error: Forbidden');
    });

    it('keeps a partial failure as a completed result with postFailures', async () => {
      const result = {
        commentsSeen: 1,
        conversationsCreated: 1,
        credentialsScanned: 1,
        messagesCreated: 1,
        postFailures: [
          { errorName: 'Error', message: 'Forbidden', postId: 'p1' },
        ],
        postsScanned: 2,
      };

      await expect(runYoutubeSync(result)).resolves.toEqual(result);
    });

    it('fails the job when the selected credential is not connected', async () => {
      await expect(
        runYoutubeSync(
          {
            commentsSeen: 0,
            conversationsCreated: 0,
            credentialsScanned: 0,
            messagesCreated: 0,
            postFailures: [],
            postsScanned: 0,
          },
          'cred-1',
        ),
      ).rejects.toThrow('no connected account');
    });
  });
});
