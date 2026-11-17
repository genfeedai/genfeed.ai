vi.mock('@libs/utils/encryption/encryption.util', () => ({
  EncryptionUtil: { decrypt: vi.fn((val: string) => val) },
}));
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
import { CronTiktokStatusService } from '@workers/crons/tiktok/cron.tiktok-status.service';
import { TIKTOK_STATUS_ACTION_IDS } from '@workers/crons/tiktok/tiktok-status-workflow-definition';
import { SchedulerPublishStateService } from '@workers/services/scheduler-publish-state.service';

/**
 * The TikTok status reconciler against the real publish-state guards. Only the
 * database is replaced, by one in-memory post, so a transition that the guards
 * refuse leaves the post untouched exactly as it would in production.
 */

// The workflow run that submitted the video to TikTok; the post keeps its id.
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
    externalId: 'publish-1',
    publishedAt: null,
    description: 'Approved text',
    category: PostCategory.VIDEO,
    format: PostFormat.STANDARD,
    isDeleted: false,
    workflowExecutionId: PUBLISH_RUN_ID,
    publishApprovalId: null,
    reviewVersionPinId: null,
    platform: 'tiktok',
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
    post: {
      findFirst: vi.fn(async () => structuredClone(stored)),
    },
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
  const tiktokService = {
    getPublishStatus: vi.fn(),
    refreshToken: vi
      .fn()
      .mockResolvedValue({ accessToken: 'encrypted-access-token' }),
  };
  const service = new CronTiktokStatusService(
    logger as never,
    {
      findOne: vi.fn(async () => ({
        ...structuredClone(stored),
        credential: {
          accessToken: 'encrypted-access-token',
          externalHandle: 'brandhandle',
          id: 'cred-1',
          isConnected: true,
        },
        updatedAt: '2026-11-17T10:00:00.000Z',
      })),
    } as never,
    tiktokService as never,
    { patch: vi.fn() } as never,
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
    const action = actions.get(TIKTOK_STATUS_ACTION_IDS.RECONCILE);
    if (!action) throw new Error('reconcile action was not registered');
    return action({
      input: {
        request: {
          maxAge: '2026-11-16T12:00:00.000Z',
          now: '2026-11-17T12:00:00.000Z',
          organizationId: 'org-1',
          postId: 'post-1',
        },
      },
      provenance: {
        executionId: RECONCILE_RUN_ID,
        workflowId: 'tiktok.status.reconcile',
        workflowLabel: 'Reconcile TikTok Status',
      },
    });
  };

  return { reconcile, stored, tiktokService };
}

describe('TikTok status reconciliation against the publish-state guards', () => {
  it('publishes a PUBLISHING post that was submitted by an earlier workflow run', async () => {
    const { reconcile, stored, tiktokService } = createHarness();
    tiktokService.getPublishStatus.mockResolvedValue({
      publicly_available_post_id: ['tiktok-post-1'],
      status: 'PUBLISH_COMPLETE',
    });

    await reconcile();

    expect(stored).toMatchObject({
      externalId: 'tiktok-post-1',
      targetExecutionState: TargetExecutionState.PUBLISHED,
      url: 'https://www.tiktok.com/@brandhandle/video/tiktok-post-1',
    });
  });

  it('fails a PUBLISHING post when TikTok rejects the video', async () => {
    const { reconcile, stored, tiktokService } = createHarness();
    tiktokService.getPublishStatus.mockRejectedValue(
      new Error('TikTok publish failed: spam_risk_too_many_posts'),
    );

    await reconcile();

    expect(stored.targetExecutionState).toBe(TargetExecutionState.FAILED);
  });

  it('records an Inbox handoff as a PUBLISHED receipt without a URL', async () => {
    const { reconcile, stored, tiktokService } = createHarness();
    tiktokService.getPublishStatus.mockResolvedValue({
      status: 'SEND_TO_USER_INBOX',
    });

    await reconcile();

    expect(stored).toMatchObject({
      externalId: 'publish-1',
      targetExecutionState: TargetExecutionState.PUBLISHED,
      url: null,
    });
  });

  it('leaves a post alone once another run already changed its publish ID', async () => {
    const { reconcile, stored, tiktokService } = createHarness();
    tiktokService.getPublishStatus.mockImplementation(async () => {
      // A newer attempt replaces the publish ID while this poll is in flight.
      stored.externalId = 'publish-2';
      return {
        publicly_available_post_id: ['tiktok-post-1'],
        status: 'PUBLISH_COMPLETE',
      };
    });

    await reconcile();

    expect(stored).toMatchObject({
      externalId: 'publish-2',
      targetExecutionState: TargetExecutionState.PUBLISHING,
    });
  });
});
