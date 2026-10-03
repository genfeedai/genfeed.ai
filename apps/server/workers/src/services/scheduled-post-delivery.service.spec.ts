import {
  SCHEDULED_POST_ACTION_IDS,
  type ScheduledPostWorkflowSource,
} from '@api/collections/posts/services/scheduled-post-workflow-definition';
import {
  type PublishResult,
  TIKTOK_APP_HANDOFF_SETTING,
  WORKFLOW_APPROVED_SCHEDULE_SETTING,
} from '@api/index';
import { BeehiivProviderError } from '@api/services/integrations/beehiiv/errors/beehiiv-provider.error';
import {
  ActivityKey,
  CredentialPlatform,
  IngredientCategory,
  PostCategory,
  PostStatus,
  PostVisibility,
  TargetExecutionState,
} from '@genfeedai/contracts';
import type { IPublishingProviderReadiness } from '@genfeedai/contracts/interfaces';
import { ScheduledPostDeliveryService } from '@workers/services/scheduled-post-delivery.service';
import { ScheduledPostFailureService } from '@workers/services/scheduled-post-failure.service';

const PUBLISH_CAPABLE_READINESS: IPublishingProviderReadiness & {
  credentialId: string;
} = {
  appReviewStatus: 'pass',
  callbackUrlStatus: 'pass',
  canSchedule: true,
  credentialId: 'cred-1',
  diagnostics: [],
  isRetryable: false,
  permissionScopeStatus: 'pass',
  providerKey: CredentialPlatform.TWITTER,
  quotaStatus: 'unknown',
  state: 'publish_capable',
  tokenFreshness: 'pass',
};

const BLOCKED_READINESS: IPublishingProviderReadiness & {
  credentialId: string;
} = {
  ...PUBLISH_CAPABLE_READINESS,
  canSchedule: false,
  diagnostics: [
    {
      classification: 'expired_credential',
      code: 'credential_access_token_missing',
      isRetryable: false,
      message: 'The provider account has no usable access credential.',
      severity: 'error',
    },
  ],
  requiredAction: 'Reconnect the provider account before publishing.',
  state: 'blocked',
  tokenFreshness: 'fail',
};

type DeliveryMocks = ReturnType<typeof createDeliveryMocks>;

type RegisteredActionRequest = {
  input: Record<string, unknown>;
  provenance: {
    executionId: string;
    workflowId: string;
    workflowLabel: string;
  };
};

type RegisteredAction = (request: RegisteredActionRequest) => Promise<unknown>;

function createDeliveryMocks() {
  const registeredActions = new Map<string, RegisteredAction>();
  return {
    activitiesService: { record: vi.fn().mockResolvedValue(undefined) },
    credentialsService: { findOne: vi.fn() },
    logger: { error: vi.fn(), log: vi.fn(), warn: vi.fn() },
    mediaReadinessService: {
      evaluatePublishReadiness: vi.fn().mockResolvedValue({
        checkedAt: '2026-09-19T10:00:00.000Z',
        diagnostics: [],
        isBlocked: false,
      }),
    },
    organizationsService: {
      findOne: vi.fn().mockResolvedValue({ id: 'org-1' }),
    },
    prisma: {
      credential: { findMany: vi.fn() },
      post: {
        findFirst: vi.fn(),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      postProviderPublishReceipt: {
        create: vi.fn().mockResolvedValue({ id: 'receipt-1' }),
        findFirst: vi.fn().mockResolvedValue(null),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    },
    publisherFactory: { getPublisher: vi.fn() },
    publishEventWebhookService: {
      emitLegacyPostFailed: vi.fn().mockResolvedValue(undefined),
      emitLegacyPostPublished: vi.fn().mockResolvedValue(undefined),
    },
    publishingReadinessService: {
      resolveForCredentials: vi.fn(
        async (
          _client: unknown,
          _organizationId: string,
          credentialIds: readonly string[],
        ) =>
          new Map(
            credentialIds.map((credentialId) => [
              credentialId,
              { ...PUBLISH_CAPABLE_READINESS, credentialId },
            ]),
          ),
      ),
    },
    quotaService: {
      checkQuota: vi.fn().mockResolvedValue({
        allowed: true,
        currentCount: 0,
        dailyLimit: 10,
      }),
    },
    replyInboundQueueService: {
      schedulePostWatch: vi.fn().mockResolvedValue({ scheduled: 1 }),
    },
    schedulerPublishStateService: {
      transitionPost: vi.fn().mockResolvedValue(true),
    },
    workflowQueue: {
      queueSystemWorkflow: vi.fn().mockResolvedValue(undefined),
    },
    registeredActions,
    systemWorkflowRunner: {
      registerAction: vi.fn((actionId: string, action: RegisteredAction) => {
        registeredActions.set(actionId, action);
      }),
    },
  };
}

function createDeliveryService(mocks: DeliveryMocks) {
  const postFailureService = new ScheduledPostFailureService(
    mocks.logger as never,
    mocks.activitiesService as never,
    mocks.schedulerPublishStateService as never,
  );
  const service = new ScheduledPostDeliveryService(
    mocks.logger as never,
    postFailureService,
    mocks.credentialsService as never,
    mocks.organizationsService as never,
    mocks.quotaService as never,
    mocks.publisherFactory as never,
    mocks.systemWorkflowRunner as never,
    mocks.publishEventWebhookService as never,
    mocks.schedulerPublishStateService as never,
    mocks.replyInboundQueueService as never,
    mocks.publishingReadinessService as never,
    mocks.prisma as never,
    mocks.mediaReadinessService as never,
    mocks.workflowQueue as never,
  );
  service.onModuleInit();
  return service;
}

async function executeDelivery(
  mocks: DeliveryMocks,
  post: Record<string, unknown>,
  source: ScheduledPostWorkflowSource,
): Promise<PublishResult> {
  mocks.prisma.post.findFirst.mockResolvedValueOnce(post);
  const action = mocks.registeredActions.get(SCHEDULED_POST_ACTION_IDS.DELIVER);
  if (!action) {
    throw new Error('Scheduled post delivery action was not registered');
  }
  return action({
    input: {
      claim: { isAlreadyPublished: false },
      request: {
        organizationId: String(post.organizationId),
        postId: String(post.id),
        source,
      },
    },
    provenance: {
      executionId: 'execution-1',
      workflowId: 'workflow-1',
      workflowLabel: 'Scheduled Post Publishing',
    },
  }) as Promise<PublishResult>;
}

function createScheduledPost(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    brandId: 'brand-1',
    children: [],
    credentialId: 'cred-1',
    description: 'Scheduled post caption',
    id: 'post-1',
    ingredients: [],
    organizationId: 'org-1',
    platform: CredentialPlatform.TWITTER,
    reviewVersionPinId: 'pin-1',
    scheduledDate: new Date('2026-07-07T09:55:00.000Z'),
    status: PostStatus.SCHEDULED,
    userId: 'user-1',
    ...overrides,
  };
}

function mockSuccessfulPublisher(
  mocks: DeliveryMocks,
  overrides: Record<string, unknown> = {},
) {
  const publish = vi.fn().mockResolvedValue({
    executionState: TargetExecutionState.PUBLISHED,
    externalId: 'tweet-1',
    platform: CredentialPlatform.TWITTER,
    success: true,
    url: 'https://x.com/example/status/tweet-1',
    ...overrides,
  });
  mocks.publisherFactory.getPublisher.mockReturnValue({
    publish,
    supportsThreads: false,
  });
  return publish;
}

describe('ScheduledPostDeliveryService', () => {
  let mocks: DeliveryMocks;
  let service: ScheduledPostDeliveryService;

  beforeEach(() => {
    mocks = createDeliveryMocks();
    mocks.credentialsService.findOne.mockResolvedValue({
      id: 'cred-1',
      platform: CredentialPlatform.TWITTER,
    });
    service = createDeliveryService(mocks);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('marks the target publishing before provider lookup', async () => {
    mockSuccessfulPublisher(mocks);
    const post = createScheduledPost();

    await executeDelivery(mocks, post, 'scheduled_sweep');

    expect(
      mocks.schedulerPublishStateService.transitionPost,
    ).toHaveBeenNthCalledWith(
      1,
      post,
      expect.objectContaining({
        error: null,
        executionState: TargetExecutionState.PUBLISHING,
        lastAttemptAt: expect.any(Date),
      }),
      undefined,
      undefined,
    );
    expect(
      mocks.schedulerPublishStateService.transitionPost.mock
        .invocationCallOrder[0],
    ).toBeLessThan(
      mocks.credentialsService.findOne.mock.invocationCallOrder[0],
    );
  });

  it('blocks an off-spec asset before any provider call', async () => {
    const publish = mockSuccessfulPublisher(mocks);
    mocks.mediaReadinessService.evaluatePublishReadiness.mockResolvedValue({
      checkedAt: '2026-09-19T10:00:00.000Z',
      diagnostics: [
        {
          actual: '1200s',
          assetId: 'asset-1',
          code: 'media_duration_above_maximum',
          kind: 'video',
          limit: 'maximum 140s',
          message: 'twitter: Duration 1200s exceeds the maximum of 140s.',
          platform: CredentialPlatform.TWITTER,
          property: 'duration',
          severity: 'error',
        },
      ],
      isBlocked: true,
    });
    const post = createScheduledPost({ ingredients: [{ id: 'asset-1' }] });

    const result = await executeDelivery(mocks, post, 'scheduled_sweep');

    expect(
      mocks.mediaReadinessService.evaluatePublishReadiness,
    ).toHaveBeenCalledWith({
      assetIds: ['asset-1'],
      organizationId: 'org-1',
      platforms: [CredentialPlatform.TWITTER],
    });
    expect(publish).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
    expect(result.error).toContain('1200s');
  });

  it('publishes an asset that only warns and keeps the diagnostics', async () => {
    const publish = mockSuccessfulPublisher(mocks);
    mocks.mediaReadinessService.evaluatePublishReadiness.mockResolvedValue({
      checkedAt: '2026-09-19T10:00:00.000Z',
      diagnostics: [
        {
          actual: '4:1',
          assetId: 'asset-1',
          code: 'media_aspect_ratio_out_of_tolerance',
          kind: 'image',
          limit: '16:9 (±10%)',
          message: 'twitter: Aspect ratio 4:1 is outside the accepted ratios.',
          platform: CredentialPlatform.TWITTER,
          property: 'aspectRatio',
          severity: 'warning',
        },
      ],
      isBlocked: false,
    });
    const post = createScheduledPost({ ingredients: [{ id: 'asset-1' }] });

    const result = await executeDelivery(mocks, post, 'scheduled_sweep');

    expect(publish).toHaveBeenCalledOnce();
    expect(result.success).toBe(true);
    expect(mocks.logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('media readiness warnings'),
      expect.objectContaining({ postId: 'post-1' }),
    );
  });

  it('gates the assets of immediate thread children too', async () => {
    mockSuccessfulPublisher(mocks);
    const post = createScheduledPost({
      children: [
        {
          id: 'child-1',
          ingredients: [{ id: 'child-asset-1' }],
          order: 0,
          threadDelayMinutes: 0,
        },
      ],
      ingredients: [{ id: 'asset-1' }],
    });

    await executeDelivery(mocks, post, 'scheduled_sweep');

    expect(
      mocks.mediaReadinessService.evaluatePublishReadiness,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        assetIds: ['asset-1', 'child-asset-1'],
      }),
    );
  });

  it('leaves a delayed thread child to its own delivery gate', async () => {
    mockSuccessfulPublisher(mocks);
    const post = createScheduledPost({
      children: [
        {
          id: 'child-1',
          ingredients: [{ id: 'child-asset-1' }],
          order: 0,
          threadDelayMinutes: 30,
        },
      ],
      ingredients: [{ id: 'asset-1' }],
    });

    await executeDelivery(mocks, post, 'scheduled_sweep');

    expect(
      mocks.mediaReadinessService.evaluatePublishReadiness,
    ).toHaveBeenCalledWith(expect.objectContaining({ assetIds: ['asset-1'] }));
  });

  it('skips the media gate for a post with no attached assets', async () => {
    mockSuccessfulPublisher(mocks);

    await executeDelivery(mocks, createScheduledPost(), 'scheduled_sweep');

    expect(
      mocks.mediaReadinessService.evaluatePublishReadiness,
    ).not.toHaveBeenCalled();
  });

  it('publishes through the provider and emits the published webhook', async () => {
    const publish = mockSuccessfulPublisher(mocks, {
      externalId: 'beehiiv-post-1',
      platform: CredentialPlatform.BEEHIIV,
      url: 'https://app.beehiiv.com/posts/beehiiv-post-1/preview',
    });
    mocks.credentialsService.findOne.mockResolvedValue({
      id: 'cred-1',
      platform: CredentialPlatform.BEEHIIV,
    });
    const post = createScheduledPost({
      platform: CredentialPlatform.BEEHIIV,
    });

    const result = await executeDelivery(mocks, post, 'scheduled_sweep');

    expect(result).toEqual(
      expect.objectContaining({
        externalId: 'beehiiv-post-1',
        success: true,
      }),
    );
    expect(
      mocks.publishEventWebhookService.emitLegacyPostPublished,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        externalProviderId: 'beehiiv-post-1',
        platform: CredentialPlatform.BEEHIIV,
        post,
        url: 'https://app.beehiiv.com/posts/beehiiv-post-1/preview',
      }),
    );
    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({
        settings: expect.objectContaining({
          [WORKFLOW_APPROVED_SCHEDULE_SETTING]: (
            post.scheduledDate as Date
          ).toISOString(),
        }),
      }),
    );
  });

  const acceptedTweet = {
    executionState: TargetExecutionState.PUBLISHED,
    externalId: 'tweet-1',
    platform: CredentialPlatform.TWITTER,
    success: true,
    url: 'https://x.com/example/status/tweet-1',
  };
  const receiptRow = (overrides: Record<string, unknown>) => ({
    attemptStartedAt: new Date(Date.now() - 60 * 60_000),
    attemptToken: 'token-0',
    id: 'receipt-1',
    result: null,
    status: 'attempting',
    workflowExecutionId: 'execution-0',
    ...overrides,
  });
  const receiptWhere = {
    attemptToken: expect.any(String),
    id: 'receipt-1',
    isDeleted: false,
    organizationId: 'org-1',
    postId: 'post-1',
  };

  it('reserves the occurrence before the provider call and resolves it after persistence', async () => {
    const publish = mockSuccessfulPublisher(mocks);

    await executeDelivery(mocks, createScheduledPost(), 'scheduled_sweep');

    const receipts = mocks.prisma.postProviderPublishReceipt;
    expect(receipts.create).toHaveBeenCalledWith({
      data: {
        attemptStartedAt: expect.any(Date),
        attemptToken: expect.any(String),
        occurrenceKey: expect.stringMatching(/^[0-9a-f]{64}$/),
        organizationId: 'org-1',
        postId: 'post-1',
        status: 'attempting',
        workflowExecutionId: 'execution-1',
      },
      select: { id: true },
    });
    expect(receipts.create.mock.invocationCallOrder[0]).toBeLessThan(
      publish.mock.invocationCallOrder[0],
    );
    expect(receipts.updateMany).toHaveBeenNthCalledWith(1, {
      data: expect.objectContaining({
        externalId: 'tweet-1',
        status: 'accepted',
      }),
      where: receiptWhere,
    });
    expect(receipts.updateMany).toHaveBeenNthCalledWith(2, {
      data: { persistedAt: expect.any(Date) },
      where: receiptWhere,
    });
  });

  it('never calls the provider when the occurrence cannot be reserved', async () => {
    const publish = mockSuccessfulPublisher(mocks);
    mocks.prisma.postProviderPublishReceipt.create.mockRejectedValue(
      new Error('database unavailable'),
    );

    await executeDelivery(mocks, createScheduledPost(), 'scheduled_sweep');

    expect(publish).not.toHaveBeenCalled();
  });

  it('never reschedules a provider-accepted publish whose state transition fails', async () => {
    const publish = mockSuccessfulPublisher(mocks);
    mocks.schedulerPublishStateService.transitionPost.mockImplementation(
      async (_post: unknown, update: { executionState: string }) => {
        if (update.executionState === TargetExecutionState.PUBLISHED)
          throw new Error('Transaction already closed: timeout');
        return true;
      },
    );

    await expect(
      executeDelivery(mocks, createScheduledPost(), 'scheduled_sweep'),
    ).rejects.toThrow(
      'Provider publish succeeded but its state transition failed.',
    );

    expect(publish).toHaveBeenCalledTimes(1);
    const states =
      mocks.schedulerPublishStateService.transitionPost.mock.calls.map(
        (call) => call[1].executionState,
      );
    expect(states).not.toContain(TargetExecutionState.SCHEDULED);
    expect(states).not.toContain(TargetExecutionState.FAILED);
    expect(
      mocks.prisma.postProviderPublishReceipt.updateMany,
    ).toHaveBeenCalledTimes(1);
    expect(
      mocks.prisma.postProviderPublishReceipt.updateMany,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'accepted' }),
      }),
    );
  });

  it('replays an accepted occurrence instead of publishing again', async () => {
    const publish = mockSuccessfulPublisher(mocks);
    mocks.prisma.postProviderPublishReceipt.findFirst.mockResolvedValue(
      receiptRow({ result: acceptedTweet, status: 'accepted' }),
    );

    const result = await executeDelivery(
      mocks,
      createScheduledPost(),
      'scheduled_sweep',
    );

    expect(publish).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({ externalId: 'tweet-1', success: true }),
    );
    expect(
      mocks.prisma.postProviderPublishReceipt.findFirst,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          isDeleted: false,
          occurrenceKey: expect.stringMatching(/^[0-9a-f]{64}$/),
          organizationId: 'org-1',
          postId: 'post-1',
        },
      }),
    );
    expect(
      mocks.schedulerPublishStateService.transitionPost,
    ).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        executionState: TargetExecutionState.PUBLISHED,
        externalId: 'tweet-1',
      }),
      undefined,
      expect.anything(),
      expect.anything(),
    );
    expect(
      mocks.prisma.postProviderPublishReceipt.create,
    ).not.toHaveBeenCalled();
  });

  it('replays an accepted occurrence even when quota is now exhausted', async () => {
    const publish = mockSuccessfulPublisher(mocks);
    mocks.quotaService.checkQuota.mockResolvedValue({
      allowed: false,
      currentCount: 10,
      dailyLimit: 10,
    });
    mocks.prisma.postProviderPublishReceipt.findFirst.mockResolvedValue(
      receiptRow({ result: acceptedTweet, status: 'accepted' }),
    );

    await executeDelivery(mocks, createScheduledPost(), 'scheduled_sweep');

    expect(publish).not.toHaveBeenCalled();
    expect(mocks.quotaService.checkQuota).not.toHaveBeenCalled();
    const states =
      mocks.schedulerPublishStateService.transitionPost.mock.calls.map(
        (call) => call[1].executionState,
      );
    expect(states).toContain(TargetExecutionState.PUBLISHED);
    expect(states).not.toContain(TargetExecutionState.FAILED);
  });

  it('refuses to publish while another delivery holds a live attempt', async () => {
    const publish = mockSuccessfulPublisher(mocks);
    mocks.prisma.postProviderPublishReceipt.findFirst.mockResolvedValue(
      receiptRow({
        attemptStartedAt: new Date(),
        workflowExecutionId: 'other',
      }),
    );

    await expect(
      executeDelivery(mocks, createScheduledPost(), 'scheduled_sweep'),
    ).rejects.toThrow('Another delivery is publishing this post occurrence.');
    expect(publish).not.toHaveBeenCalled();
  });

  it('keeps a timed-out attempt for verification and soft-retries it', async () => {
    mocks.publisherFactory.getPublisher.mockReturnValue({
      publish: vi.fn().mockRejectedValue(new Error('ETIMEDOUT')),
      supportsThreads: false,
    });

    await executeDelivery(mocks, createScheduledPost(), 'scheduled_sweep');

    expect(
      mocks.prisma.postProviderPublishReceipt.updateMany,
    ).toHaveBeenCalledWith({
      data: { status: 'uncertain' },
      where: receiptWhere,
    });
    expect(
      mocks.schedulerPublishStateService.transitionPost,
    ).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        executionState: TargetExecutionState.SCHEDULED,
      }),
      expect.any(String),
      expect.anything(),
    );
  });

  it('releases the attempt when the provider rejects the publish', async () => {
    mockSuccessfulPublisher(mocks, {
      error: 'rejected',
      executionState: TargetExecutionState.FAILED,
      success: false,
    });

    await executeDelivery(mocks, createScheduledPost(), 'scheduled_sweep');

    expect(
      mocks.prisma.postProviderPublishReceipt.updateMany,
    ).toHaveBeenCalledWith({
      data: { status: 'released' },
      where: receiptWhere,
    });
  });

  it('marks an unconfirmed attempt published when the provider verifies it landed', async () => {
    const publish = vi.fn();
    const verifyPublished = vi.fn().mockResolvedValue(acceptedTweet);
    mocks.publisherFactory.getPublisher.mockReturnValue({
      publish,
      supportsThreads: false,
      verifyPublished,
    });
    const startedAt = new Date(Date.now() - 60 * 60_000);
    mocks.prisma.postProviderPublishReceipt.findFirst.mockResolvedValue(
      receiptRow({ attemptStartedAt: startedAt, status: 'uncertain' }),
    );

    await executeDelivery(mocks, createScheduledPost(), 'scheduled_sweep');

    expect(verifyPublished).toHaveBeenCalledWith(expect.anything(), startedAt);
    expect(publish).not.toHaveBeenCalled();
    expect(
      mocks.prisma.postProviderPublishReceipt.updateMany,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'accepted' }),
      }),
    );
    expect(
      mocks.schedulerPublishStateService.transitionPost,
    ).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        executionState: TargetExecutionState.PUBLISHED,
      }),
      undefined,
      expect.anything(),
      expect.anything(),
    );
  });

  it.each([
    {
      label: 'the provider confirms it is absent',
      verify: vi.fn().mockResolvedValue(null),
    },
    { label: 'the publisher cannot verify', verify: undefined },
  ])('retries an unconfirmed attempt when $label', async ({ verify }) => {
    const publish = vi.fn().mockResolvedValue(acceptedTweet);
    mocks.publisherFactory.getPublisher.mockReturnValue({
      publish,
      supportsThreads: false,
      ...(verify ? { verifyPublished: verify } : {}),
    });
    mocks.prisma.postProviderPublishReceipt.findFirst.mockResolvedValue(
      receiptRow({ status: 'uncertain' }),
    );

    await executeDelivery(mocks, createScheduledPost(), 'scheduled_sweep');

    expect(
      mocks.prisma.postProviderPublishReceipt.updateMany,
    ).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: 'attempting',
        workflowExecutionId: 'execution-1',
      }),
      where: { ...receiptWhere, attemptToken: 'token-0' },
    });
    expect(publish).toHaveBeenCalledTimes(1);
  });

  it('soft-retries without publishing when verification is unavailable', async () => {
    const publish = vi.fn();
    mocks.publisherFactory.getPublisher.mockReturnValue({
      publish,
      supportsThreads: false,
      verifyPublished: vi.fn().mockRejectedValue(new Error('provider 503')),
    });
    mocks.prisma.postProviderPublishReceipt.findFirst.mockResolvedValue(
      receiptRow({ status: 'uncertain' }),
    );

    await executeDelivery(mocks, createScheduledPost(), 'scheduled_sweep');

    expect(publish).not.toHaveBeenCalled();
    expect(
      mocks.schedulerPublishStateService.transitionPost,
    ).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        executionState: TargetExecutionState.SCHEDULED,
      }),
      expect.any(String),
      expect.anything(),
    );
  });

  it('keeps a returned timeout uncertain instead of releasing it', async () => {
    mockSuccessfulPublisher(mocks, {
      error: 'ETIMEDOUT while publishing',
      executionState: TargetExecutionState.FAILED,
      success: false,
    });

    await executeDelivery(mocks, createScheduledPost(), 'scheduled_sweep');

    expect(
      mocks.prisma.postProviderPublishReceipt.updateMany,
    ).toHaveBeenCalledWith({
      data: { status: 'uncertain' },
      where: receiptWhere,
    });
    expect(
      mocks.schedulerPublishStateService.transitionPost,
    ).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        executionState: TargetExecutionState.SCHEDULED,
      }),
      expect.any(String),
      expect.anything(),
    );
  });

  it('verifies an uncertain attempt before quota or readiness can fail it', async () => {
    const publish = vi.fn();
    mocks.publisherFactory.getPublisher.mockReturnValue({
      publish,
      supportsThreads: false,
      verifyPublished: vi.fn().mockResolvedValue(acceptedTweet),
    });
    mocks.quotaService.checkQuota.mockResolvedValue({
      allowed: false,
      currentCount: 10,
      dailyLimit: 10,
    });
    mocks.prisma.postProviderPublishReceipt.findFirst.mockResolvedValue(
      receiptRow({ status: 'uncertain' }),
    );

    await executeDelivery(mocks, createScheduledPost(), 'scheduled_sweep');

    expect(publish).not.toHaveBeenCalled();
    expect(mocks.quotaService.checkQuota).not.toHaveBeenCalled();
    const states =
      mocks.schedulerPublishStateService.transitionPost.mock.calls.map(
        (call) => call[1].executionState,
      );
    expect(states).toContain(TargetExecutionState.PUBLISHED);
    expect(states).not.toContain(TargetExecutionState.FAILED);
  });

  it('releases a fresh reservation when a pre-publish gate fails', async () => {
    const publish = mockSuccessfulPublisher(mocks);
    mocks.quotaService.checkQuota.mockResolvedValue({
      allowed: false,
      currentCount: 10,
      dailyLimit: 10,
    });

    await executeDelivery(mocks, createScheduledPost(), 'scheduled_sweep');

    expect(publish).not.toHaveBeenCalled();
    expect(
      mocks.prisma.postProviderPublishReceipt.updateMany,
    ).toHaveBeenCalledWith({
      data: { status: 'released' },
      where: receiptWhere,
    });
  });

  it('lets only the delivery that wins the takeover publish an unconfirmed attempt', async () => {
    const publish = vi.fn().mockResolvedValue(acceptedTweet);
    mocks.publisherFactory.getPublisher.mockReturnValue({
      publish,
      supportsThreads: false,
    });
    mocks.prisma.postProviderPublishReceipt.findFirst.mockResolvedValue(
      receiptRow({ status: 'uncertain' }),
    );
    mocks.prisma.postProviderPublishReceipt.updateMany.mockResolvedValueOnce({
      count: 0,
    });

    await expect(
      executeDelivery(mocks, createScheduledPost(), 'scheduled_sweep'),
    ).rejects.toThrow('Another delivery is publishing this post occurrence.');
    expect(publish).not.toHaveBeenCalled();
  });

  it('treats a live attempt of the same execution as in flight', async () => {
    const publish = mockSuccessfulPublisher(mocks);
    mocks.prisma.postProviderPublishReceipt.findFirst.mockResolvedValue(
      receiptRow({
        attemptStartedAt: new Date(),
        workflowExecutionId: 'execution-1',
      }),
    );

    await expect(
      executeDelivery(mocks, createScheduledPost(), 'scheduled_sweep'),
    ).rejects.toThrow('Another delivery is publishing this post occurrence.');
    expect(publish).not.toHaveBeenCalled();
  });

  it('persists an accepted occurrence even after its credential was removed', async () => {
    const publish = mockSuccessfulPublisher(mocks);
    mocks.credentialsService.findOne.mockResolvedValue(null);
    mocks.prisma.postProviderPublishReceipt.findFirst.mockResolvedValue(
      receiptRow({ result: acceptedTweet, status: 'accepted' }),
    );

    await executeDelivery(mocks, createScheduledPost(), 'scheduled_sweep');

    expect(publish).not.toHaveBeenCalled();
    const states =
      mocks.schedulerPublishStateService.transitionPost.mock.calls.map(
        (call) => call[1].executionState,
      );
    expect(states).toContain(TargetExecutionState.PUBLISHED);
    expect(states).not.toContain(TargetExecutionState.FAILED);
  });

  it('keeps a provider-accepted occurrence publishing when the workflow fails', async () => {
    mocks.prisma.postProviderPublishReceipt.findFirst.mockResolvedValue(
      receiptRow({ result: acceptedTweet, status: 'accepted' }),
    );

    const result = await service.failTerminalValidation(
      createScheduledPost() as never,
      new Error('Provider publish succeeded but its state transition failed.'),
    );

    expect(result.executionState).toBe(TargetExecutionState.PUBLISHING);
    expect(
      mocks.schedulerPublishStateService.transitionPost,
    ).not.toHaveBeenCalled();
    expect(
      mocks.publishEventWebhookService.emitLegacyPostFailed,
    ).not.toHaveBeenCalled();
  });

  it('carries the provider shortcode into the publish webhook', async () => {
    mockSuccessfulPublisher(mocks, {
      externalShortcode: 'tweet-short',
    });
    const post = createScheduledPost();

    await executeDelivery(mocks, post, 'scheduled_sweep');

    expect(
      mocks.publishEventWebhookService.emitLegacyPostPublished,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        externalProviderId: 'tweet-1',
        externalShortcode: 'tweet-short',
        platform: CredentialPlatform.TWITTER,
        post,
        url: 'https://x.com/example/status/tweet-1',
      }),
    );
  });

  it('looks up a publisher with the domain platform for a Prisma SCREAMING credential', async () => {
    mockSuccessfulPublisher(mocks);
    mocks.credentialsService.findOne.mockResolvedValue({
      id: 'cred-1',
      platform: 'TWITTER',
    });
    const post = createScheduledPost();

    await executeDelivery(mocks, post, 'scheduled_sweep');

    expect(mocks.publisherFactory.getPublisher).toHaveBeenCalledWith(
      CredentialPlatform.TWITTER,
    );
    expect(mocks.publisherFactory.getPublisher.mock.calls[0]?.[0]).toBe(
      'twitter',
    );
  });

  it('omits the workflow schedule setting and live instants for a publish-now provider draft', async () => {
    const publish = mockSuccessfulPublisher(mocks, {
      externalId: 'beehiiv-post-1',
      isProviderDraft: true,
      platform: CredentialPlatform.BEEHIIV,
      url: 'https://app.beehiiv.com/posts/beehiiv-post-1/preview',
    });
    mocks.credentialsService.findOne.mockResolvedValue({
      id: 'cred-1',
      platform: CredentialPlatform.BEEHIIV,
    });
    const post = createScheduledPost({
      platform: CredentialPlatform.BEEHIIV,
      targetSettings: { providerStatus: 'draft' },
    });

    await executeDelivery(mocks, post, 'publish_now');

    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({
        settings: expect.not.objectContaining({
          [WORKFLOW_APPROVED_SCHEDULE_SETTING]: expect.any(String),
        }),
      }),
    );
    const draftUpdate =
      mocks.schedulerPublishStateService.transitionPost.mock.calls[1]?.[1];
    expect(draftUpdate).toEqual(
      expect.objectContaining({
        executionState: TargetExecutionState.PUBLISHED,
        externalId: 'beehiiv-post-1',
      }),
    );
    expect(draftUpdate).not.toHaveProperty('publishedAt');
    expect(draftUpdate).not.toHaveProperty('publicationDate');
    expect(
      mocks.publishEventWebhookService.emitLegacyPostPublished,
    ).not.toHaveBeenCalled();
  });

  it('marks a TikTok app workflow delivery as a native-app handoff', async () => {
    const publish = mockSuccessfulPublisher(mocks, {
      executionState: TargetExecutionState.PUBLISHING,
      externalId: 'v_inbox_file~123',
      platform: CredentialPlatform.TIKTOK,
      url: '',
    });
    mocks.credentialsService.findOne.mockResolvedValue({
      id: 'cred-1',
      platform: CredentialPlatform.TIKTOK,
    });
    const post = createScheduledPost({
      category: 'VIDEO',
      ingredients: [{ id: 'video-1' }],
      platform: CredentialPlatform.TIKTOK,
      targetSettings: { privacyLevel: 'public' },
    });

    await executeDelivery(mocks, post, 'tiktok_app');

    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({
        settings: expect.objectContaining({
          [TIKTOK_APP_HANDOFF_SETTING]: true,
        }),
      }),
    );
  });

  it('persists a grouped provider success even when the provider omits its id', async () => {
    mockSuccessfulPublisher(mocks, {
      externalId: null,
      url: '',
    });
    const post = createScheduledPost({ groupId: 'group-1' });

    await executeDelivery(mocks, post, 'scheduled_sweep');

    expect(
      mocks.schedulerPublishStateService.transitionPost,
    ).toHaveBeenNthCalledWith(
      2,
      post,
      expect.objectContaining({
        executionState: TargetExecutionState.PUBLISHED,
        externalId: null,
        workflowExecutionId: 'execution-1',
      }),
      undefined,
      {
        expectedWorkflowExecutionId: 'execution-1',
        priorExecutionStates: [TargetExecutionState.PUBLISHING],
      },
    );
    expect(mocks.logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('provider returned no external id'),
      expect.objectContaining({ postId: 'post-1' }),
    );
  });

  it('records a retryable grouped provider failure as scheduled with structured error state', async () => {
    mocks.publisherFactory.getPublisher.mockReturnValue({
      publish: vi.fn().mockResolvedValue({
        error: '429 rate limit',
        executionState: TargetExecutionState.FAILED,
        externalId: null,
        platform: CredentialPlatform.TWITTER,
        success: false,
        url: '',
      }),
      supportsThreads: false,
    });
    const post = createScheduledPost({ groupId: 'group-1', retryCount: 0 });

    const result = await executeDelivery(mocks, post, 'scheduled_sweep');

    expect(result).toEqual(
      expect.objectContaining({
        executionState: TargetExecutionState.SCHEDULED,
        success: false,
      }),
    );
    expect(
      mocks.schedulerPublishStateService.transitionPost,
    ).toHaveBeenNthCalledWith(
      2,
      post,
      expect.objectContaining({
        error: expect.objectContaining({
          code: 'rate_limited',
          isRetryable: true,
        }),
        executionState: TargetExecutionState.SCHEDULED,
        retryCount: 1,
        workflowExecutionId: 'execution-1',
      }),
      '429 rate limit',
      {
        expectedWorkflowExecutionId: 'execution-1',
        priorExecutionStates: [TargetExecutionState.PUBLISHING],
      },
    );
    expect(
      mocks.publishEventWebhookService.emitLegacyPostFailed,
    ).not.toHaveBeenCalled();
  });

  it('records a publisher validation failure as terminally failed without retry', async () => {
    const validationError =
      'YouTube caption is 5001 characters; the limit is 5000 characters.';
    mocks.publisherFactory.getPublisher.mockReturnValue({
      publish: vi.fn().mockResolvedValue({
        error: validationError,
        errorCode: 'caption_too_long',
        executionState: TargetExecutionState.FAILED,
        externalId: null,
        platform: CredentialPlatform.TWITTER,
        success: false,
        url: '',
      }),
      supportsThreads: false,
    });
    const post = createScheduledPost({ groupId: 'group-1', retryCount: 0 });

    const result = await executeDelivery(mocks, post, 'scheduled_sweep');

    expect(result).toEqual(
      expect.objectContaining({
        executionState: TargetExecutionState.FAILED,
        success: false,
      }),
    );
    expect(
      mocks.schedulerPublishStateService.transitionPost,
    ).toHaveBeenNthCalledWith(
      2,
      post,
      expect.objectContaining({
        error: expect.objectContaining({
          code: 'caption_too_long',
          isRetryable: false,
        }),
        executionState: TargetExecutionState.FAILED,
        workflowExecutionId: 'execution-1',
      }),
      validationError,
      {
        expectedWorkflowExecutionId: 'execution-1',
        priorExecutionStates: [TargetExecutionState.PUBLISHING],
      },
    );
  });

  it('records Beehiiv authorization rejection without a transient retry', async () => {
    mocks.credentialsService.findOne.mockResolvedValue({
      id: 'cred-1',
      platform: CredentialPlatform.BEEHIIV,
    });
    mocks.publisherFactory.getPublisher.mockReturnValue({
      publish: vi
        .fn()
        .mockRejectedValue(
          new BeehiivProviderError(
            'authorization_failed',
            'Beehiiv rejected the connected credential.',
            { isRetryable: false, statusCode: 401 },
          ),
        ),
      supportsThreads: false,
    });
    const post = createScheduledPost({
      groupId: 'group-1',
      platform: CredentialPlatform.BEEHIIV,
      retryCount: 0,
    });

    await executeDelivery(mocks, post, 'scheduled_sweep');

    expect(
      mocks.schedulerPublishStateService.transitionPost,
    ).toHaveBeenNthCalledWith(
      2,
      post,
      expect.objectContaining({
        error: expect.objectContaining({
          code: 'authorization_failed',
          isRetryable: false,
        }),
        executionState: TargetExecutionState.FAILED,
      }),
      'Beehiiv rejected the connected credential.',
      expect.any(Object),
    );
  });

  it('emits failure webhooks only after retries are exhausted', async () => {
    mocks.publisherFactory.getPublisher.mockReturnValue({
      publish: vi.fn().mockResolvedValue({
        error: 'Provider validation failed',
        executionState: TargetExecutionState.FAILED,
        externalId: null,
        platform: CredentialPlatform.TWITTER,
        success: false,
        url: '',
      }),
      supportsThreads: false,
    });
    const post = createScheduledPost({ retryCount: 3 });

    await executeDelivery(mocks, post, 'scheduled_sweep');

    expect(
      mocks.publishEventWebhookService.emitLegacyPostFailed,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        errorMessage: 'Provider validation failed',
        platform: CredentialPlatform.TWITTER,
        post,
      }),
    );
  });

  it('fails a queued publish whose channel stopped being publishable after it was scheduled', async () => {
    mocks.publishingReadinessService.resolveForCredentials.mockResolvedValue(
      new Map([['cred-1', BLOCKED_READINESS]]),
    );
    const post = createScheduledPost({ retryCount: 0 });

    const result = await executeDelivery(mocks, post, 'scheduled_sweep');

    expect(mocks.publisherFactory.getPublisher).not.toHaveBeenCalled();
    expect(mocks.quotaService.checkQuota).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        error: 'The provider account has no usable access credential.',
        executionState: TargetExecutionState.FAILED,
        platform: CredentialPlatform.TWITTER,
        success: false,
      }),
    );
    expect(
      mocks.schedulerPublishStateService.transitionPost,
    ).toHaveBeenNthCalledWith(
      2,
      post,
      expect.objectContaining({
        error: expect.objectContaining({
          code: 'credential_access_token_missing',
          isRetryable: false,
          message: 'The provider account has no usable access credential.',
        }),
        executionState: TargetExecutionState.FAILED,
      }),
      'The provider account has no usable access credential.',
      undefined,
    );
    expect(
      mocks.publishEventWebhookService.emitLegacyPostFailed,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        errorMessage: 'The provider account has no usable access credential.',
        platform: CredentialPlatform.TWITTER,
        post,
      }),
    );
  });

  it('corrects a legacy TEXT target with a linked video before validating and publishing it', async () => {
    const publish = mockSuccessfulPublisher(mocks);
    mocks.credentialsService.findOne.mockResolvedValue({
      id: 'cred-1',
      platform: CredentialPlatform.YOUTUBE,
    });
    const post = createScheduledPost({
      category: PostCategory.TEXT,
      ingredients: [{ category: IngredientCategory.VIDEO, id: 'video-1' }],
      platform: CredentialPlatform.YOUTUBE,
    });

    const result = await executeDelivery(mocks, post, 'scheduled_sweep');

    expect(mocks.prisma.post.updateMany).toHaveBeenCalledWith({
      data: { category: PostCategory.VIDEO },
      where: { id: 'post-1', isDeleted: false, organizationId: 'org-1' },
    });
    expect(result.error ?? '').not.toContain('media');
    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({
        post: expect.objectContaining({ category: PostCategory.VIDEO }),
      }),
    );
  });

  it('fails a text-only post on a video-required channel and notifies the owner', async () => {
    const publish = mockSuccessfulPublisher(mocks);
    mocks.credentialsService.findOne.mockResolvedValue({
      id: 'cred-1',
      platform: CredentialPlatform.YOUTUBE,
    });
    const post = createScheduledPost({ platform: CredentialPlatform.YOUTUBE });

    const result = await executeDelivery(mocks, post, 'scheduled_sweep');

    expect(publish).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        error: 'YouTube requires at least 1 media item(s).',
        executionState: TargetExecutionState.FAILED,
        success: false,
      }),
    );
    expect(
      mocks.schedulerPublishStateService.transitionPost,
    ).toHaveBeenNthCalledWith(
      2,
      post,
      expect.objectContaining({
        error: expect.objectContaining({
          code: 'channel_target_invalid',
          isRetryable: false,
          message: 'YouTube requires at least 1 media item(s).',
        }),
        executionState: TargetExecutionState.FAILED,
      }),
      'YouTube requires at least 1 media item(s).',
      undefined,
    );
    expect(mocks.activitiesService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        entityId: 'post-1',
        key: ActivityKey.POST_FAILED,
        organizationId: 'org-1',
        userId: 'user-1',
        value: 'YouTube requires at least 1 media item(s).',
      }),
    );
    expect(
      mocks.publishEventWebhookService.emitLegacyPostFailed,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        errorMessage: 'YouTube requires at least 1 media item(s).',
        post,
      }),
    );
  });

  it('fails the pending thread children of a parent that fails before the provider', async () => {
    mocks.credentialsService.findOne.mockResolvedValue(null);
    const post = createScheduledPost({
      children: [{ groupId: 'group-1', id: 'child-1' }],
    });

    await executeDelivery(mocks, post, 'scheduled_sweep');

    expect(
      mocks.schedulerPublishStateService.transitionPost,
    ).toHaveBeenCalledWith(
      { groupId: 'group-1', id: 'child-1', organizationId: 'org-1' },
      expect.objectContaining({
        error: expect.objectContaining({ code: 'parent_failed' }),
        executionState: TargetExecutionState.FAILED,
      }),
      'Parent post failed',
      {
        priorExecutionStates: [
          TargetExecutionState.SCHEDULED,
          TargetExecutionState.PUBLISHING,
        ],
      },
    );
  });

  it('does not notify when the failed transition was stale', async () => {
    mocks.credentialsService.findOne.mockResolvedValue(null);
    mocks.schedulerPublishStateService.transitionPost
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    const post = createScheduledPost();

    const result = await executeDelivery(mocks, post, 'scheduled_sweep');

    expect(result).toEqual(
      expect.objectContaining({
        error: 'Credential not found',
        success: false,
      }),
    );
    expect(mocks.activitiesService.record).not.toHaveBeenCalled();
    expect(
      mocks.publishEventWebhookService.emitLegacyPostFailed,
    ).not.toHaveBeenCalled();
  });

  it('keeps a failed target failed when recording the owner notification throws', async () => {
    mocks.credentialsService.findOne.mockResolvedValue(null);
    mocks.activitiesService.record.mockRejectedValue(
      new Error('activity store unavailable'),
    );
    const post = createScheduledPost();

    const result = await executeDelivery(mocks, post, 'scheduled_sweep');

    expect(result).toEqual(
      expect.objectContaining({
        error: 'Credential not found',
        executionState: TargetExecutionState.FAILED,
      }),
    );
    expect(
      mocks.schedulerPublishStateService.transitionPost,
    ).not.toHaveBeenCalledWith(
      post,
      expect.objectContaining({
        executionState: TargetExecutionState.SCHEDULED,
      }),
      expect.anything(),
      expect.anything(),
    );
    expect(mocks.logger.error).toHaveBeenCalledWith(
      expect.stringContaining('failed to record publish failure activity'),
      expect.objectContaining({ error: 'activity store unavailable' }),
    );
  });

  it('resolves consume-time readiness tenant-scoped for the post own credential', async () => {
    mockSuccessfulPublisher(mocks);
    const post = createScheduledPost();

    const result = await executeDelivery(mocks, post, 'scheduled_sweep');

    expect(
      mocks.publishingReadinessService.resolveForCredentials,
    ).toHaveBeenCalledWith(mocks.prisma, 'org-1', ['cred-1']);
    expect(result).toEqual(expect.objectContaining({ success: true }));
  });

  it('fails closed when consume-time readiness cannot be resolved at all', async () => {
    mocks.publishingReadinessService.resolveForCredentials.mockResolvedValue(
      new Map(),
    );
    const post = createScheduledPost({ retryCount: 0 });

    const result = await executeDelivery(mocks, post, 'scheduled_sweep');

    expect(mocks.publisherFactory.getPublisher).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        error: 'Channel is not ready to publish',
        success: false,
      }),
    );
  });

  it('resolves credential via scalar FKs when relation aliases are undefined', async () => {
    mockSuccessfulPublisher(mocks, {
      externalId: 'tweet-scalar-1',
      externalShortcode: null,
      platform: CredentialPlatform.TWITTER,
      url: 'https://x.com/example/status/tweet-scalar-1',
    });
    mocks.organizationsService.findOne.mockResolvedValue({
      id: 'org-scalar-1',
    });
    mocks.credentialsService.findOne.mockImplementation(
      (query: { id?: unknown }) =>
        query?.id === 'cred-scalar-1'
          ? Promise.resolve({
              id: 'cred-scalar-1',
              platform: 'TWITTER',
            })
          : Promise.resolve(null),
    );
    const post = createScheduledPost({
      brandId: 'brand-scalar-1',
      credentialId: 'cred-scalar-1',
      organizationId: 'org-scalar-1',
      platform: CredentialPlatform.TWITTER,
      userId: 'user-scalar-1',
    });

    const result = await executeDelivery(mocks, post, 'scheduled_sweep');

    expect(mocks.credentialsService.findOne).toHaveBeenCalledWith({
      id: 'cred-scalar-1',
      isDeleted: false,
      organizationId: 'org-scalar-1',
    });
    expect(
      mocks.publishEventWebhookService.emitLegacyPostFailed,
    ).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        externalId: 'tweet-scalar-1',
      }),
    );
  });

  it('fails closed when the credential cannot be loaded', async () => {
    mocks.credentialsService.findOne.mockResolvedValue(null);
    const post = createScheduledPost();

    const result = await executeDelivery(mocks, post, 'scheduled_sweep');

    expect(result).toEqual(
      expect.objectContaining({
        error: 'Credential not found',
        success: false,
      }),
    );
    expect(mocks.publisherFactory.getPublisher).not.toHaveBeenCalled();
    expect(
      mocks.publishEventWebhookService.emitLegacyPostFailed,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        errorMessage: 'Credential not found',
        post,
      }),
    );
  });

  it('records quota exhaustion as a terminal failed delivery with an activity', async () => {
    mocks.quotaService.checkQuota.mockResolvedValue({
      allowed: false,
      currentCount: 10,
      dailyLimit: 10,
    });
    const post = createScheduledPost();

    const result = await executeDelivery(mocks, post, 'scheduled_sweep');

    expect(mocks.publisherFactory.getPublisher).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        error: 'Quota exceeded',
        executionState: TargetExecutionState.FAILED,
        success: false,
      }),
    );
    expect(mocks.activitiesService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        key: ActivityKey.POST_FAILED,
        value: 'Quota exceeded: 10/10 posts for twitter',
      }),
    );
    expect(
      mocks.publishEventWebhookService.emitLegacyPostFailed,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        errorMessage: 'Quota exceeded',
        platform: CredentialPlatform.TWITTER,
        post,
      }),
    );
  });

  it('publishes thread children after a successful parent delivery', async () => {
    const publishThreadChildren = vi.fn().mockResolvedValue(undefined);
    mocks.publisherFactory.getPublisher.mockReturnValue({
      publish: vi.fn().mockResolvedValue({
        executionState: TargetExecutionState.PUBLISHED,
        externalId: 'tweet-1',
        platform: CredentialPlatform.TWITTER,
        success: true,
        url: 'https://x.com/example/status/tweet-1',
      }),
      publishThreadChildren,
      supportsThreads: true,
    });
    const children = [{ id: 'child-1' }, { id: 'child-2' }];
    const post = createScheduledPost({ children });

    await executeDelivery(mocks, post, 'scheduled_sweep');

    expect(publishThreadChildren).toHaveBeenCalledWith(
      expect.objectContaining({ postId: 'post-1' }),
      children,
      'tweet-1',
    );
    expect(
      mocks.schedulerPublishStateService.transitionPost,
    ).not.toHaveBeenCalledWith(
      expect.objectContaining({ id: 'child-1' }),
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
  });

  it('parks a delayed comment and publishes only the immediate ones', async () => {
    const publishThreadChildren = vi.fn().mockResolvedValue(undefined);
    mocks.publisherFactory.getPublisher.mockReturnValue({
      publish: vi.fn().mockResolvedValue({
        executionState: TargetExecutionState.PUBLISHED,
        externalId: 'tweet-1',
        platform: CredentialPlatform.TWITTER,
        success: true,
        url: 'https://x.com/example/status/tweet-1',
      }),
      publishThreadChildren,
      supportsThreads: true,
    });
    const post = createScheduledPost({
      children: [
        { id: 'child-1', order: 1 },
        { id: 'child-2', order: 2, threadDelayMinutes: 15 },
      ],
    });

    await executeDelivery(mocks, post, 'scheduled_sweep');

    expect(publishThreadChildren).toHaveBeenCalledWith(
      expect.objectContaining({ postId: 'post-1' }),
      [{ id: 'child-1', order: 1 }],
      'tweet-1',
    );
    expect(mocks.prisma.post.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { scheduledDate: expect.any(Date) },
        where: expect.objectContaining({
          id: 'child-2',
          organizationId: 'org-1',
        }),
      }),
    );
  });

  it('marks thread children failed when child delivery throws after parent success', async () => {
    mocks.publisherFactory.getPublisher.mockReturnValue({
      publish: vi.fn().mockResolvedValue({
        executionState: TargetExecutionState.PUBLISHED,
        externalId: 'tweet-1',
        platform: CredentialPlatform.TWITTER,
        success: true,
        url: 'https://x.com/example/status/tweet-1',
      }),
      publishThreadChildren: vi
        .fn()
        .mockRejectedValue(new Error('thread child rejected')),
      supportsThreads: true,
    });
    const post = createScheduledPost({
      children: [{ id: 'child-1' }],
    });

    const result = await executeDelivery(mocks, post, 'scheduled_sweep');

    expect(result).toEqual(expect.objectContaining({ success: true }));
    expect(
      mocks.schedulerPublishStateService.transitionPost,
    ).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'child-1', organizationId: 'org-1' }),
      expect.objectContaining({
        error: expect.objectContaining({ message: 'thread child rejected' }),
        executionState: TargetExecutionState.FAILED,
      }),
      'thread child rejected',
      {
        priorExecutionStates: [
          TargetExecutionState.SCHEDULED,
          TargetExecutionState.PUBLISHING,
        ],
      },
    );
    expect(mocks.logger.error).toHaveBeenCalledWith(
      expect.stringContaining('failed to publish thread children'),
      expect.objectContaining({
        childrenCount: 1,
        error: 'thread child rejected',
      }),
    );
  });

  it('keeps a deferred provider verification in the publishing state', async () => {
    mockSuccessfulPublisher(mocks, {
      executionState: TargetExecutionState.PUBLISHING,
      externalId: 'tiktok-publish-1',
    });
    const post = createScheduledPost();

    const result = await executeDelivery(mocks, post, 'scheduled_sweep');

    expect(
      mocks.schedulerPublishStateService.transitionPost,
    ).toHaveBeenNthCalledWith(
      2,
      post,
      expect.objectContaining({
        executionState: TargetExecutionState.PUBLISHING,
        externalId: 'tiktok-publish-1',
        workflowExecutionId: 'execution-1',
      }),
      undefined,
      expect.any(Object),
    );
    expect(
      mocks.publishEventWebhookService.emitLegacyPostPublished,
    ).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        executionState: TargetExecutionState.PUBLISHING,
        success: true,
      }),
    );
  });

  it('records a terminal validation failure without retrying the provider', async () => {
    const post = createScheduledPost();

    const result = await service.failTerminalValidation(
      post as never,
      new Error('Canonical Post digest no longer matches pin.'),
    );

    expect(result).toEqual(
      expect.objectContaining({
        error: 'Canonical Post digest no longer matches pin.',
        executionState: TargetExecutionState.FAILED,
        success: false,
      }),
    );
    expect(mocks.publisherFactory.getPublisher).not.toHaveBeenCalled();
    expect(
      mocks.schedulerPublishStateService.transitionPost,
    ).toHaveBeenCalledWith(
      post,
      expect.objectContaining({
        executionState: TargetExecutionState.FAILED,
        error: expect.objectContaining({
          code: 'publish_validation_failed',
          isRetryable: false,
          message: 'Canonical Post digest no longer matches pin.',
        }),
      }),
      'Canonical Post digest no longer matches pin.',
      undefined,
    );
    expect(
      mocks.publishEventWebhookService.emitLegacyPostFailed,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        errorMessage: 'Canonical Post digest no longer matches pin.',
        post,
      }),
    );
  });

  it.each([
    { error: new Error(''), expectedMessage: '' },
    {
      error: 'validation failed',
      expectedMessage: 'Publish validation failed',
    },
  ])(
    'preserves terminal validation fallback behavior for $error',
    async ({ error, expectedMessage }) => {
      const post = createScheduledPost();

      const result = await service.failTerminalValidation(post as never, error);

      expect(result.error).toBe(expectedMessage);
      expect(mocks.logger.error).toHaveBeenCalledWith(
        'Durable validation rejected queued publishing',
        expect.objectContaining({ error: expectedMessage }),
      );
    },
  );
});

describe('publication finalization delivery', () => {
  it.each([
    PostVisibility.PUBLIC,
    PostVisibility.PRIVATE,
    PostVisibility.UNLISTED,
  ])(
    'preserves %s visibility and forwards public-only immutable finalization',
    async (visibility) => {
      const mocks = createDeliveryMocks();
      createDeliveryService(mocks);
      mocks.credentialsService.findOne.mockResolvedValue({
        id: 'cred-1',
        platform: CredentialPlatform.YOUTUBE,
      });
      const result = {
        success: true,
        externalId: 'provider-1',
        executionState: TargetExecutionState.PUBLISHED,
        platform: CredentialPlatform.YOUTUBE,
        url: 'https://example.com/provider-1',
      };
      mocks.publisherFactory.getPublisher.mockReturnValue({
        publish: vi.fn().mockResolvedValue(result),
      });
      await executeDelivery(
        mocks,
        createScheduledPost({
          visibility,
          platform: CredentialPlatform.YOUTUBE,
          ingredients: [{ category: IngredientCategory.VIDEO, id: 'video-1' }],
        }),
        'publish_now',
      );
      const terminal =
        mocks.schedulerPublishStateService.transitionPost.mock.calls.find(
          (call) => call[1].executionState === TargetExecutionState.PUBLISHED,
        );
      expect(terminal?.[1].visibility).toBe(visibility);
      expect(terminal?.[4]).toEqual(
        visibility === PostVisibility.PUBLIC
          ? {
              result,
              source: 'ScheduledPostDeliveryService.persistProviderSuccess',
            }
          : undefined,
      );
    },
  );

  it('keeps genuine provider success when the after-commit refresh queue fails', async () => {
    const mocks = createDeliveryMocks();
    createDeliveryService(mocks);
    mocks.credentialsService.findOne.mockResolvedValue({
      id: 'cred-1',
      platform: CredentialPlatform.TWITTER,
    });
    const result = {
      success: true,
      externalId: 'provider-1',
      executionState: TargetExecutionState.PUBLISHED,
      platform: CredentialPlatform.TWITTER,
      url: '',
    };
    mocks.publisherFactory.getPublisher.mockReturnValue({
      publish: vi.fn().mockResolvedValue(result),
    });
    mocks.workflowQueue.queueSystemWorkflow.mockRejectedValue(
      new Error('Redis unavailable'),
    );
    expect(
      await executeDelivery(
        mocks,
        createScheduledPost({ visibility: PostVisibility.PUBLIC }),
        'publish_now',
      ),
    ).toEqual(result);
    expect(mocks.logger.warn).toHaveBeenCalledWith(
      'Failed to queue publication learning refresh',
      expect.anything(),
    );
  });
});
