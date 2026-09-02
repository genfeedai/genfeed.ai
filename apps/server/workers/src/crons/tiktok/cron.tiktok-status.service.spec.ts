vi.mock('@libs/utils/encryption/encryption.util', () => ({
  EncryptionUtil: { decrypt: vi.fn((val: string) => val) },
}));

import { CredentialPlatform, TargetExecutionState } from '@genfeedai/enums';
import { CronTiktokStatusService } from '@workers/crons/tiktok/cron.tiktok-status.service';
import {
  buildTiktokStatusReconcileDefinition,
  buildTiktokStatusSweepDefinition,
  TIKTOK_STATUS_ACTION_IDS,
} from '@workers/crons/tiktok/tiktok-status-workflow-definition';

describe('TikTok status workflows', () => {
  it('fans pending posts into atomic reconciliation workflows', () => {
    expect(
      buildTiktokStatusSweepDefinition().definition.nodes[1]?.data.config
        .actionId,
    ).toBe('workflow.for-each-tenant');
    expect(
      buildTiktokStatusReconcileDefinition().definition.nodes,
    ).toHaveLength(1);
  });
});

type RegisteredActionRequest = {
  input: Record<string, unknown>;
  provenance: {
    executionId: string;
    workflowId: string;
    workflowLabel: string;
  };
};

type RegisteredAction = (request: RegisteredActionRequest) => Promise<unknown>;

function createHarness() {
  const registeredActions = new Map<string, RegisteredAction>();
  const logger = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };
  const postsService = { findOne: vi.fn() };
  const tiktokService = {
    getPublishStatus: vi.fn(),
    refreshToken: vi
      .fn()
      .mockResolvedValue({ accessToken: 'encrypted-access-token' }),
  };
  const credentialsService = { patch: vi.fn().mockResolvedValue(undefined) };
  const runner = {
    registerAction: vi.fn((actionId: string, action: RegisteredAction) => {
      registeredActions.set(actionId, action);
    }),
    registerWorkflow: vi.fn(),
  };
  const workflowQueue = {
    queueSystemWorkflow: vi.fn().mockResolvedValue(undefined),
  };
  const publishEventWebhookService = {
    emitLegacyPostFailed: vi.fn().mockResolvedValue(undefined),
    emitLegacyPostPublished: vi.fn().mockResolvedValue(undefined),
  };
  const schedulerPublishStateService = { transitionPost: vi.fn() };
  const scheduledPostWorkflowService = {
    finalizePublishedPost: vi.fn().mockResolvedValue(undefined),
  };

  const service = new CronTiktokStatusService(
    logger as never,
    postsService as never,
    tiktokService as never,
    credentialsService as never,
    runner as never,
    workflowQueue as never,
    publishEventWebhookService as never,
    schedulerPublishStateService as never,
    scheduledPostWorkflowService as never,
  );
  service.onModuleInit();

  return {
    credentialsService,
    postsService,
    publishEventWebhookService,
    registeredActions,
    scheduledPostWorkflowService,
    schedulerPublishStateService,
    tiktokService,
  };
}

function makeTiktokPost(overrides: Record<string, unknown> = {}) {
  return {
    brandId: 'brand-1',
    credential: {
      accessToken: 'encrypted-access-token',
      externalHandle: 'brandhandle',
      id: 'cred-1',
      isConnected: true,
    },
    externalId: 'publish-1',
    id: 'post-1',
    organizationId: 'org-1',
    updatedAt: '2026-09-01T12:00:00.000Z',
    userId: 'user-1',
    ...overrides,
  };
}

async function reconcile(
  registeredActions: Map<string, RegisteredAction>,
  requestOverrides: Record<string, unknown> = {},
) {
  const action = registeredActions.get(TIKTOK_STATUS_ACTION_IDS.RECONCILE);
  if (!action) {
    throw new Error('TikTok status reconcile action was not registered');
  }
  return action({
    input: {
      request: {
        maxAge: '2026-08-01T00:00:00.000Z',
        now: '2026-09-02T00:00:00.000Z',
        organizationId: 'org-1',
        postId: 'post-1',
        ...requestOverrides,
      },
    },
    provenance: {
      executionId: 'exec-1',
      workflowId: 'tiktok.status.reconcile',
      workflowLabel: 'Reconcile TikTok Status',
    },
  });
}

describe('CronTiktokStatusService', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('finalizes recurrence and streak once TikTok confirms the post is public', async () => {
    const harness = createHarness();
    const post = makeTiktokPost();
    harness.postsService.findOne.mockResolvedValue(post);
    harness.tiktokService.getPublishStatus.mockResolvedValue({
      publicly_available_post_id: ['tiktok-post-1'],
      status: 'PUBLISH_COMPLETE',
    });
    harness.schedulerPublishStateService.transitionPost.mockResolvedValue(true);

    await reconcile(harness.registeredActions);

    expect(
      harness.schedulerPublishStateService.transitionPost,
    ).toHaveBeenCalledWith(
      post,
      expect.objectContaining({
        executionState: TargetExecutionState.PUBLISHED,
        externalId: 'tiktok-post-1',
      }),
      expect.any(String),
      expect.objectContaining({
        priorExecutionStates: [TargetExecutionState.PUBLISHING],
      }),
    );
    expect(
      harness.scheduledPostWorkflowService.finalizePublishedPost,
    ).toHaveBeenCalledOnce();
    expect(
      harness.scheduledPostWorkflowService.finalizePublishedPost,
    ).toHaveBeenCalledWith(
      post,
      expect.objectContaining({
        executionState: TargetExecutionState.PUBLISHED,
        externalId: 'tiktok-post-1',
        isProviderDraft: false,
        platform: CredentialPlatform.TIKTOK,
        success: true,
      }),
      'CronTiktokStatusService.applyStatusTransition',
    );
    expect(
      harness.publishEventWebhookService.emitLegacyPostPublished,
    ).toHaveBeenCalledOnce();
  });

  it('does not finalize when TikTok reports moderation failure', async () => {
    const harness = createHarness();
    const post = makeTiktokPost();
    harness.postsService.findOne.mockResolvedValue(post);
    harness.tiktokService.getPublishStatus.mockRejectedValue(
      new Error('TikTok publish failed: Content violates guidelines'),
    );
    harness.schedulerPublishStateService.transitionPost.mockResolvedValue(true);

    await reconcile(harness.registeredActions);

    expect(
      harness.schedulerPublishStateService.transitionPost,
    ).toHaveBeenCalledWith(
      post,
      expect.objectContaining({ executionState: TargetExecutionState.FAILED }),
      expect.any(String),
      expect.objectContaining({
        priorExecutionStates: [TargetExecutionState.PUBLISHING],
      }),
    );
    expect(
      harness.scheduledPostWorkflowService.finalizePublishedPost,
    ).not.toHaveBeenCalled();
    expect(
      harness.publishEventWebhookService.emitLegacyPostFailed,
    ).toHaveBeenCalledOnce();
    expect(
      harness.publishEventWebhookService.emitLegacyPostPublished,
    ).not.toHaveBeenCalled();
  });

  it('does not double-finalize when the confirmation is reconciled twice', async () => {
    const harness = createHarness();
    const post = makeTiktokPost();
    harness.postsService.findOne.mockResolvedValue(post);
    harness.tiktokService.getPublishStatus.mockResolvedValue({
      publicly_available_post_id: ['tiktok-post-1'],
      status: 'PUBLISH_COMPLETE',
    });
    harness.schedulerPublishStateService.transitionPost
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    await reconcile(harness.registeredActions);
    await reconcile(harness.registeredActions);

    expect(
      harness.schedulerPublishStateService.transitionPost,
    ).toHaveBeenCalledTimes(2);
    expect(
      harness.scheduledPostWorkflowService.finalizePublishedPost,
    ).toHaveBeenCalledTimes(1);
    expect(
      harness.publishEventWebhookService.emitLegacyPostPublished,
    ).toHaveBeenCalledTimes(1);
  });
});
