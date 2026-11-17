vi.mock(
  '@api/collections/content-learning/services/learning-artifact-binding.helper',
  () => ({ bindLearningPublicationV1: vi.fn() }),
);

import type { PostLifecycleTransitionInput } from '@api/post-lifecycle/post-lifecycle.service';
import {
  PostCategory,
  PostFormat,
  PostVisibility,
  TargetExecutionState,
} from '@genfeedai/contracts';
import { CronYoutubeStatusService } from '@workers/crons/youtube/cron.youtube-status.service';
import { YOUTUBE_MAINTENANCE_ACTION_IDS } from '@workers/crons/youtube/youtube-maintenance-workflow-definition';
import { SchedulerPublishStateService } from '@workers/services/scheduler-publish-state.service';

/**
 * The YouTube status reconciler against the real publish-state guards. Only the
 * database is replaced, by one in-memory post, so a transition that the guards
 * refuse leaves the post untouched exactly as it would in production.
 */

// The workflow run that uploaded the video to YouTube; the post keeps its id.
const PUBLISH_RUN_ID = 'publish-run';
// The reconcile run the status sweep starts later: always a different run.
const RECONCILE_RUN_ID = 'reconcile-run';

function createStoredPost(): Record<string, unknown> {
  return {
    id: 'post-1',
    organizationId: 'org-1',
    brandId: 'brand-1',
    credentialId: 'cred-1',
    targetExecutionState: TargetExecutionState.PUBLISHING,
    visibility: PostVisibility.PUBLIC,
    externalId: 'video-1',
    publishedAt: null,
    description: 'Approved text',
    category: PostCategory.VIDEO,
    format: PostFormat.STANDARD,
    isDeleted: false,
    workflowExecutionId: PUBLISH_RUN_ID,
    publishApprovalId: null,
    reviewVersionPinId: null,
    platform: 'youtube',
    parentId: null,
    targetAttachments: [],
    quoteTweetId: null,
    entityArticleId: null,
    entityIngredientId: null,
    entityModel: null,
    _count: { ingredientLinks: 0, children: 0 },
  };
}

function createHarness() {
  const stored = createStoredPost();
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    contentLearningAccount: {
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    contentLearningDependency: { findMany: vi.fn().mockResolvedValue([]) },
    organization: { findFirst: vi.fn().mockResolvedValue(null) },
    post: { findFirst: vi.fn(async () => structuredClone(stored)) },
    postProviderPublishReceipt: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    postPublishFinalization: {
      create: vi.fn().mockResolvedValue({ id: 'finalization-1' }),
      findUnique: vi.fn().mockResolvedValue(null),
    },
  };
  const lifecycle = {
    transition: vi.fn(
      async (input: PostLifecycleTransitionInput, _tx: unknown) => {
        Object.assign(
          stored,
          input.mutation,
          { targetExecutionState: input.nextState },
          input.visibility ? { visibility: input.visibility } : {},
        );
        return { kind: 'transitioned', target: stored };
      },
    ),
  };
  const logger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };
  const prisma = { $transaction: vi.fn(async (run) => run(tx)) };
  const publishState = new SchedulerPublishStateService(
    prisma as never,
    logger as never,
    lifecycle as never,
  );

  const actions = new Map<string, (request: unknown) => Promise<unknown>>();
  const youtubeService = { getVideoStatus: vi.fn() };
  const service = new CronYoutubeStatusService(
    logger as never,
    {
      findOne: vi.fn(async () => structuredClone(stored)),
    } as never,
    youtubeService as never,
    {
      registerAction: (
        id: string,
        action: (request: unknown) => Promise<unknown>,
      ) => actions.set(id, action),
      registerWorkflow: vi.fn(),
    } as never,
    { queueSystemWorkflow: vi.fn().mockResolvedValue(undefined) } as never,
    {
      emitPostFailed: vi.fn().mockResolvedValue(undefined),
      emitPostPublished: vi.fn().mockResolvedValue(undefined),
    } as never,
    publishState,
    {
      processPendingPublishedFinalization: vi.fn().mockResolvedValue(true),
    } as never,
  );
  service.onModuleInit();

  const reconcile = async () => {
    const action = actions.get(YOUTUBE_MAINTENANCE_ACTION_IDS.RECONCILE_STATUS);
    if (!action) throw new Error('reconcile action was not registered');
    return action({
      input: { request: { organizationId: 'org-1', postId: 'post-1' } },
      provenance: {
        executionId: RECONCILE_RUN_ID,
        workflowId: 'youtube.status.reconcile',
        workflowLabel: 'Reconcile YouTube Status',
      },
    });
  };

  return { reconcile, stored, youtubeService };
}

describe('YouTube status reconciliation against the publish-state guards', () => {
  it('publishes a PUBLISHING video that was uploaded by an earlier workflow run', async () => {
    const { reconcile, stored, youtubeService } = createHarness();
    youtubeService.getVideoStatus.mockResolvedValue({
      privacyStatus: 'public',
    });

    await reconcile();

    expect(stored).toMatchObject({
      targetExecutionState: TargetExecutionState.PUBLISHED,
      url: 'https://www.youtube.com/watch?v=video-1',
      visibility: PostVisibility.PUBLIC,
    });
  });
});
