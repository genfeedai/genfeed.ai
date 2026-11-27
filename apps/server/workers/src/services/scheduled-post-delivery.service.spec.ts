import { assertBreakoutPublicationDispatch } from '@api/collections/outliers/services/breakout-publication-fence.util';
import {
  SCHEDULED_POST_ACTION_IDS,
  type ScheduledPostWorkflowSource,
} from '@api/collections/posts/services/scheduled-post-workflow-definition';
import { XPostingBillingGate } from '@api/common/subscriptions/x-posting-billing-gate.service';
import { BusinessLogicException } from '@api/exceptions/business-logic.exception';
import {
  type IPublisher,
  type PublishResult,
  TIKTOK_APP_HANDOFF_SETTING,
  WORKFLOW_APPROVED_SCHEDULE_SETTING,
} from '@api/index';
import { BeehiivProviderError } from '@api/services/integrations/beehiiv/errors/beehiiv-provider.error';
import { BeehiivPublisherService } from '@api/services/integrations/publishers/beehiiv-publisher.service';
import { GhostPublisherService } from '@api/services/integrations/publishers/ghost-publisher.service';
import { LinkedInPublisherService } from '@api/services/integrations/publishers/linkedin-publisher.service';
import { MastodonPublisherService } from '@api/services/integrations/publishers/mastodon-publisher.service';
import { ShopifyPublisherService } from '@api/services/integrations/publishers/shopify-publisher.service';
import { ThreadsPublisherService } from '@api/services/integrations/publishers/threads-publisher.service';
import { TwitterPublisherService } from '@api/services/integrations/publishers/twitter-publisher.service';
import { WordpressPublisherService } from '@api/services/integrations/publishers/wordpress-publisher.service';
import {
  ActivityKey,
  CredentialPlatform,
  IngredientCategory,
  PostCategory,
  PostStatus,
  PostVisibility,
  PublishErrorKind,
  TargetExecutionState,
} from '@genfeedai/contracts';
import {
  type IPublishingProviderReadiness,
  PublishError,
} from '@genfeedai/contracts/interfaces';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import { ForbiddenException } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import { ScheduledPostChannelRecoveryService } from '@workers/services/scheduled-post-channel-recovery.service';
import { ScheduledPostDeliveryService } from '@workers/services/scheduled-post-delivery.service';
import { ScheduledPostFailureService } from '@workers/services/scheduled-post-failure.service';
import { PROVIDER_PUBLISH_LEASE_RENEWAL_MS } from '@workers/services/scheduled-post-provider-receipt.util';
import { ScheduledPostPublishFollowUps } from '@workers/services/scheduled-post-publish-follow-ups';
import { ScheduledPostXBilling } from '@workers/services/scheduled-post-x-billing';
import { of } from 'rxjs';

vi.mock('@sentry/nestjs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sentry/nestjs')>()),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

// The fence reads the database and the actor; its own spec covers that. Here it only
// has to be asked at the right moment and to stop the provider call when it holds.
vi.mock(
  '@api/collections/outliers/services/breakout-publication-fence.util',
  async (original) => ({
    ...(await original<
      typeof import('@api/collections/outliers/services/breakout-publication-fence.util')
    >()),
    assertBreakoutPublicationDispatch: vi.fn(),
  }),
);

beforeEach(() => {
  vi.mocked(assertBreakoutPublicationDispatch)
    .mockReset()
    .mockResolvedValue(undefined);
});

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
    credits: {
      checkOrganizationCreditsAvailable: vi.fn().mockResolvedValue(true),
      deductCreditsFromOrganization: vi.fn().mockResolvedValue(undefined),
    },
    credentialRefresher: {
      refreshCredential: vi.fn().mockResolvedValue({ success: true }),
    },
    credentialsService: {
      findOne: vi.fn(),
      patch: vi.fn().mockResolvedValue(undefined),
      findOneSelect: vi.fn(function (
        this: { findOne: (params: unknown) => unknown },
        params: unknown,
      ) {
        return this.findOne(params);
      }),
    },
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
        findMany: vi.fn().mockResolvedValue([]),
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
      emitPostFailed: vi.fn().mockResolvedValue(undefined),
      emitPostPublished: vi.fn().mockResolvedValue(undefined),
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
  const xBilling = new ScheduledPostXBilling(
    mocks.logger as never,
    new XPostingBillingGate(mocks.credits as never),
    mocks.credits as never,
    mocks.prisma as never,
    { get: () => 'https://app.genfeed.ai' } as never,
  );
  const followUps = new ScheduledPostPublishFollowUps(
    mocks.logger as never,
    mocks.prisma as never,
    postFailureService,
    mocks.replyInboundQueueService as never,
    mocks.publishEventWebhookService as never,
    xBilling,
  );
  const service = new ScheduledPostDeliveryService(
    mocks.logger as never,
    postFailureService,
    mocks.credentialsService as never,
    mocks.organizationsService as never,
    mocks.quotaService as never,
    mocks.publisherFactory as never,
    mocks.systemWorkflowRunner as never,
    followUps,
    mocks.schedulerPublishStateService as never,
    xBilling,
    mocks.publishingReadinessService as never,
    mocks.prisma as never,
    mocks.mediaReadinessService as never,
    mocks.workflowQueue as never,
    new ScheduledPostChannelRecoveryService(
      mocks.logger as never,
      mocks.credentialsService as never,
      mocks.credentialRefresher as never,
      mocks.activitiesService as never,
    ),
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
      mocks.publishEventWebhookService.emitPostPublished,
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

  describe('X posting cost', () => {
    it('never calls X when the organization cannot pay for the post', async () => {
      const publish = mockSuccessfulPublisher(mocks);
      mocks.credits.checkOrganizationCreditsAvailable.mockResolvedValue(false);

      const result = await executeDelivery(
        mocks,
        createScheduledPost(),
        'scheduled_sweep',
      );

      expect(publish).not.toHaveBeenCalled();
      expect(result.success).toBe(false);
      expect(result.error).toContain('Not enough credits');
      expect(result.error).toContain('https://app.genfeed.ai/settings/credits');
      expect(
        mocks.credits.checkOrganizationCreditsAvailable,
      ).toHaveBeenCalledWith('org-1', 3);
    });

    it('prices the credit check of a post with a link at the link cost', async () => {
      mockSuccessfulPublisher(mocks);

      await executeDelivery(
        mocks,
        createScheduledPost({
          description: 'New drop https://genfeed.ai/drop',
        }),
        'scheduled_sweep',
      );

      expect(
        mocks.credits.checkOrganizationCreditsAvailable,
      ).toHaveBeenCalledWith('org-1', 30);
    });

    it('charges 3 credits once X accepted a post without a link', async () => {
      mockSuccessfulPublisher(mocks);

      await executeDelivery(mocks, createScheduledPost(), 'scheduled_sweep');

      expect(mocks.credits.deductCreditsFromOrganization).toHaveBeenCalledTimes(
        1,
      );
      expect(mocks.credits.deductCreditsFromOrganization).toHaveBeenCalledWith(
        'org-1',
        'user-1',
        3,
        'X post published',
        expect.anything(),
        expect.objectContaining({
          brandId: 'brand-1',
          idempotencyKey: 'x-post-publish:post-1',
        }),
      );
    });

    it('charges 30 credits for a post with a link', async () => {
      mockSuccessfulPublisher(mocks);

      await executeDelivery(
        mocks,
        createScheduledPost({
          description: 'New drop https://genfeed.ai/drop',
        }),
        'scheduled_sweep',
      );

      expect(mocks.credits.deductCreditsFromOrganization).toHaveBeenCalledWith(
        'org-1',
        'user-1',
        30,
        'X post with a link published',
        expect.anything(),
        expect.objectContaining({ idempotencyKey: 'x-post-publish:post-1' }),
      );
    });

    it('still reports the post as published when the charge fails', async () => {
      mockSuccessfulPublisher(mocks);
      mocks.credits.deductCreditsFromOrganization.mockRejectedValue(
        new Error('ledger unavailable'),
      );

      const result = await executeDelivery(
        mocks,
        createScheduledPost(),
        'scheduled_sweep',
      );

      expect(result.success).toBe(true);
    });

    it('charges nothing for a post on another platform', async () => {
      mockSuccessfulPublisher(mocks, {
        externalId: 'beehiiv-post-1',
        platform: CredentialPlatform.BEEHIIV,
      });
      mocks.credentialsService.findOne.mockResolvedValue({
        id: 'cred-1',
        platform: CredentialPlatform.BEEHIIV,
      });

      const result = await executeDelivery(
        mocks,
        createScheduledPost({ platform: CredentialPlatform.BEEHIIV }),
        'scheduled_sweep',
      );

      expect(result.success).toBe(true);
      expect(
        mocks.credits.deductCreditsFromOrganization,
      ).not.toHaveBeenCalled();
      expect(
        mocks.credits.checkOrganizationCreditsAvailable,
      ).not.toHaveBeenCalled();
    });
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
    leaseRenewedAt: new Date(Date.now() - 60 * 60_000),
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
        leaseRenewedAt: expect.any(Date),
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
      data: {
        attemptStartedAt: expect.any(Date),
        leaseRenewedAt: expect.any(Date),
      },
      where: { ...receiptWhere, status: 'attempting' },
    });
    expect(receipts.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      publish.mock.invocationCallOrder[0],
    );
    expect(receipts.updateMany).toHaveBeenNthCalledWith(2, {
      data: expect.objectContaining({
        externalId: 'tweet-1',
        status: 'accepted',
      }),
      where: receiptWhere,
    });
    expect(receipts.updateMany).toHaveBeenNthCalledWith(3, {
      data: {
        externalId: 'tweet-1',
        persistedAt: expect.any(Date),
        result: expect.objectContaining({ externalId: 'tweet-1' }),
        status: 'accepted',
      },
      where: receiptWhere,
    });
  });

  it('never calls the provider once a stalled reservation was taken over', async () => {
    const publish = mockSuccessfulPublisher(mocks);
    mocks.prisma.postProviderPublishReceipt.updateMany.mockResolvedValueOnce({
      count: 0,
    });

    await expect(
      executeDelivery(mocks, createScheduledPost(), 'scheduled_sweep'),
    ).rejects.toThrow('Another delivery is publishing this post occurrence.');
    expect(publish).not.toHaveBeenCalled();
    expect(
      mocks.prisma.postProviderPublishReceipt.updateMany,
    ).toHaveBeenCalledTimes(1);
  });

  it('renews the lease while the provider call is running', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    let finishPublish: (result: PublishResult) => void = () => undefined;
    const publish = vi.fn(
      () =>
        new Promise<PublishResult>((done) => {
          finishPublish = done;
        }),
    );
    mocks.publisherFactory.getPublisher.mockReturnValue({
      publish,
      supportsThreads: false,
    });

    const delivery = executeDelivery(
      mocks,
      createScheduledPost(),
      'scheduled_sweep',
    );
    await vi.waitFor(() => expect(publish).toHaveBeenCalled());
    await vi.advanceTimersByTimeAsync(PROVIDER_PUBLISH_LEASE_RENEWAL_MS);

    expect(
      mocks.prisma.postProviderPublishReceipt.updateMany,
    ).toHaveBeenCalledWith({
      data: { leaseRenewedAt: expect.any(Date) },
      where: { ...receiptWhere, status: 'attempting' },
    });
    finishPublish(acceptedTweet);
    await delivery;
    vi.useRealTimers();
  });

  it('resolves the receipt when persistence succeeds after a failed accept write', async () => {
    mockSuccessfulPublisher(mocks);
    const receipts = mocks.prisma.postProviderPublishReceipt;
    receipts.updateMany.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => {
        if (data.status === 'accepted' && !data.persistedAt)
          throw new Error('receipt write timed out');
        return { count: 1 };
      },
    );

    await executeDelivery(mocks, createScheduledPost(), 'scheduled_sweep');

    expect(receipts.updateMany).toHaveBeenLastCalledWith({
      data: expect.objectContaining({
        persistedAt: expect.any(Date),
        status: 'accepted',
      }),
      where: receiptWhere,
    });
  });

  it('never calls the provider when the occurrence cannot be reserved', async () => {
    const publish = mockSuccessfulPublisher(mocks);
    mocks.prisma.postProviderPublishReceipt.create.mockRejectedValue(
      new Error('database unavailable'),
    );

    await expect(
      executeDelivery(mocks, createScheduledPost(), 'scheduled_sweep'),
    ).rejects.toThrow('Provider publish attempt state is unavailable.');

    expect(publish).not.toHaveBeenCalled();
    const states =
      mocks.schedulerPublishStateService.transitionPost.mock.calls.map(
        (call) => call[1].executionState,
      );
    expect(states).toEqual([TargetExecutionState.PUBLISHING]);
  });

  it('never fails or retries an occurrence whose receipt lookup fails', async () => {
    const publish = mockSuccessfulPublisher(mocks);
    mocks.prisma.postProviderPublishReceipt.findFirst.mockRejectedValueOnce(
      new Error('receipt store unavailable'),
    );

    await expect(
      executeDelivery(
        mocks,
        createScheduledPost({ retryCount: 3 }),
        'scheduled_sweep',
      ),
    ).rejects.toThrow('Provider publish attempt state is unavailable.');

    expect(publish).not.toHaveBeenCalled();
    const states =
      mocks.schedulerPublishStateService.transitionPost.mock.calls.map(
        (call) => call[1].executionState,
      );
    expect(states).not.toContain(TargetExecutionState.FAILED);
    expect(states).not.toContain(TargetExecutionState.SCHEDULED);
  });

  it('records a thrown gate error before releasing the held reservation', async () => {
    const publish = mockSuccessfulPublisher(mocks);
    mocks.quotaService.checkQuota.mockRejectedValue(
      new Error('quota store exploded'),
    );

    await executeDelivery(mocks, createScheduledPost(), 'scheduled_sweep');

    expect(publish).not.toHaveBeenCalled();
    const transitions = mocks.schedulerPublishStateService.transitionPost.mock;
    const failureWrite = transitions.calls.findIndex(
      (call) => call[1].executionState !== TargetExecutionState.PUBLISHING,
    );
    expect(failureWrite).toBeGreaterThan(-1);
    const receipts = mocks.prisma.postProviderPublishReceipt;
    const releaseCall = receipts.updateMany.mock.calls.findIndex(
      (call) =>
        (call[0] as { data: { status?: string } }).data.status === 'released',
    );
    expect(releaseCall).toBeGreaterThan(-1);
    expect(transitions.invocationCallOrder[failureWrite]).toBeLessThan(
      receipts.updateMany.mock.invocationCallOrder[releaseCall],
    );
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
    ).toHaveBeenCalledTimes(2);
    expect(
      mocks.prisma.postProviderPublishReceipt.updateMany,
    ).toHaveBeenLastCalledWith(
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
        leaseRenewedAt: new Date(),
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
      publish: vi
        .fn()
        .mockRejectedValue(
          new PublishError(PublishErrorKind.OUTCOME_UNKNOWN, 'ETIMEDOUT'),
        ),
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

  it('reports a terminal provider failure to Sentry with its error code', async () => {
    vi.mocked(Sentry.captureException).mockClear();
    mocks.publisherFactory.getPublisher.mockReturnValue({
      publish: vi.fn().mockRejectedValue(
        Object.assign(new Error('X API credits depleted.'), {
          code: 'x_credits_depleted',
        }),
      ),
      supportsThreads: false,
    });

    await executeDelivery(mocks, createScheduledPost(), 'scheduled_sweep');

    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'X API credits depleted.' }),
      expect.objectContaining({
        fingerprint: ['scheduled-post-publish-failed', 'x_credits_depleted'],
        tags: expect.objectContaining({
          'publish.error_code': 'x_credits_depleted',
        }),
      }),
    );
  });

  it('tells the owner nothing while a retryable provider failure still has retries left', async () => {
    mocks.activitiesService.record.mockClear();
    mocks.publisherFactory.getPublisher.mockReturnValue({
      publish: vi
        .fn()
        .mockRejectedValue(
          new PublishError(PublishErrorKind.OUTCOME_UNKNOWN, 'ETIMEDOUT'),
        ),
      supportsThreads: false,
    });

    await executeDelivery(mocks, createScheduledPost(), 'scheduled_sweep');

    expect(mocks.activitiesService.record).not.toHaveBeenCalled();
  });

  it('does not report a retryable provider failure to Sentry', async () => {
    vi.mocked(Sentry.captureException).mockClear();
    mocks.publisherFactory.getPublisher.mockReturnValue({
      publish: vi
        .fn()
        .mockRejectedValue(
          new PublishError(PublishErrorKind.OUTCOME_UNKNOWN, 'ETIMEDOUT'),
        ),
      supportsThreads: false,
    });

    await executeDelivery(mocks, createScheduledPost(), 'scheduled_sweep');

    expect(Sentry.captureException).not.toHaveBeenCalled();
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
      platform: CredentialPlatform.TWITTER,
      publisherClass: TwitterPublisherService,
    },
    {
      platform: CredentialPlatform.LINKEDIN,
      publisherClass: LinkedInPublisherService,
    },
    {
      platform: CredentialPlatform.THREADS,
      publisherClass: ThreadsPublisherService,
    },
    {
      platform: CredentialPlatform.MASTODON,
      publisherClass: MastodonPublisherService,
    },
    {
      platform: CredentialPlatform.WORDPRESS,
      publisherClass: WordpressPublisherService,
    },
    {
      platform: CredentialPlatform.GHOST,
      publisherClass: GhostPublisherService,
    },
    {
      platform: CredentialPlatform.SHOPIFY,
      publisherClass: ShopifyPublisherService,
    },
    {
      platform: CredentialPlatform.BEEHIIV,
      publisherClass: BeehiivPublisherService,
    },
  ])(
    'replays a landed timeout through the actual $platform verification hook without publishing twice',
    async ({ platform, publisherClass }) => {
      const startedAt = new Date(Date.now() - 60 * 60_000);
      const createdAt = new Date(startedAt.getTime() + 1000);
      const page = {
        items: [
          {
            id: 'verified-parent',
            createdAt,
            hasMedia: false,
            isReply: false,
            text: 'Scheduled post caption',
            title: 'Exact title',
            status:
              platform === CredentialPlatform.WORDPRESS
                ? 'publish'
                : platform === CredentialPlatform.GHOST
                  ? 'published'
                  : platform === CredentialPlatform.BEEHIIV
                    ? 'confirmed'
                    : 'ACTIVE',
            visibility:
              platform === CredentialPlatform.LINKEDIN
                ? 'PUBLIC'
                : PostVisibility.PUBLIC,
            url: 'https://example.com/verified-parent',
            scheduledAt: new Date('2026-07-07T09:55:00Z'),
          },
        ],
        nextCursor: null,
      };
      const publish = vi.fn();
      const listPublishVerificationPage = vi.fn().mockResolvedValue(page);
      // Execute the concrete hook and base result builder; the network leaf is
      // mocked. API publisher specs separately exercise its account-scoped HTTP.
      const publisher: IPublisher = Object.assign(
        Object.create(publisherClass.prototype),
        {
          credentialsService: mocks.credentialsService,
          httpService: {
            get: vi.fn().mockReturnValue(
              of({
                data: {
                  data: [
                    {
                      id: 'verified-parent',
                      author_id: 'account',
                      created_at: createdAt.toISOString(),
                      text: 'Scheduled post caption',
                    },
                  ],
                  meta: { result_count: 1 },
                },
              }),
            ),
          },
          linkedInService: { listPublishVerificationPage },
          publish,
          supportsThreads: false,
          threadsService: { listPublishVerificationPage },
          wordpressService: { listPublishVerificationPage },
          ghostService: { listPublishVerificationPage },
          shopifyService: { listPublishVerificationPage },
          beehiivService: { listPublishVerificationPage },
          mastodonService: { listPublishVerificationPage },
          twitterService: {
            buildTweetUrl: (id: string) => `https://x.com/account/status/${id}`,
          },
        },
      );
      vi.spyOn(EncryptionUtil, 'decrypt').mockReturnValue('fixture-token');
      mocks.credentialsService.findOne.mockResolvedValue({
        id: 'cred-1',
        accessToken: 'fixture',
        externalId: 'account',
        externalHandle: 'account',
        platform,
      });
      mocks.publisherFactory.getPublisher.mockReturnValue(publisher);
      mocks.prisma.postProviderPublishReceipt.findFirst.mockResolvedValue(
        receiptRow({ attemptStartedAt: startedAt, status: 'uncertain' }),
      );

      await executeDelivery(
        mocks,
        createScheduledPost({
          category: PostCategory.TEXT,
          label: 'Exact title',
          platform,
        }),
        'scheduled_sweep',
      );

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
          externalId: 'verified-parent',
        }),
        undefined,
        expect.anything(),
        expect.anything(),
      );
      vi.restoreAllMocks();
    },
  );

  it('passes thread evidence to verification so a found parent cannot settle an incomplete thread', async () => {
    const verifyPublished = vi.fn().mockImplementation(async (context) => {
      expect(context.hasThreadChildren).toBe(true);
      throw new Error('Parent evidence cannot verify thread completion');
    });
    const publish = vi.fn();
    mocks.publisherFactory.getPublisher.mockReturnValue({
      publish,
      supportsThreads: true,
      verifyPublished,
    });
    mocks.prisma.postProviderPublishReceipt.findFirst.mockResolvedValue(
      receiptRow({ status: 'uncertain' }),
    );

    await executeDelivery(
      mocks,
      createScheduledPost({ children: [{ id: 'child-1' }] }),
      'scheduled_sweep',
    );

    expect(verifyPublished).toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
    expect(
      mocks.prisma.postProviderPublishReceipt.updateMany,
    ).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'accepted' }),
      }),
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
      where: { ...receiptWhere, attemptToken: 'token-0', status: 'uncertain' },
    });
    expect(publish).toHaveBeenCalledTimes(1);
  });

  it('keeps an unverifiable unconfirmed attempt publishing without spending the retry budget', async () => {
    const publish = vi.fn();
    mocks.publisherFactory.getPublisher.mockReturnValue({
      publish,
      supportsThreads: false,
      verifyPublished: vi.fn().mockRejectedValue(new Error('provider 503')),
    });
    mocks.prisma.postProviderPublishReceipt.findFirst.mockResolvedValue(
      receiptRow({ status: 'uncertain' }),
    );

    const result = await executeDelivery(
      mocks,
      createScheduledPost({ retryCount: 3 }),
      'scheduled_sweep',
    );

    expect(publish).not.toHaveBeenCalled();
    expect(result.executionState).toBe(TargetExecutionState.PUBLISHING);
    const calls = mocks.schedulerPublishStateService.transitionPost.mock.calls;
    const states = calls.map((call) => call[1].executionState);
    expect(states).not.toContain(TargetExecutionState.FAILED);
    expect(states).not.toContain(TargetExecutionState.SCHEDULED);
    const deferred = calls.find((call) => call[1].error)?.[1];
    expect(deferred).toEqual(
      expect.objectContaining({
        error: expect.objectContaining({
          code: 'publish_outcome_unconfirmed',
        }),
        executionState: TargetExecutionState.PUBLISHING,
      }),
    );
    expect(deferred).not.toHaveProperty('retryCount');
    // Dated ahead so discovery waits the verification backoff, not 60s.
    expect(deferred.lastAttemptAt.getTime()).toBeGreaterThan(Date.now());
    expect(
      mocks.publishEventWebhookService.emitPostFailed,
    ).not.toHaveBeenCalled();
  });

  it('never calls an unverifiable publisher again once its retry budget is spent, however often it is delivered', async () => {
    const publish = vi
      .fn()
      .mockRejectedValue(
        new PublishError(PublishErrorKind.OUTCOME_UNKNOWN, 'ETIMEDOUT'),
      );
    mocks.publisherFactory.getPublisher.mockReturnValue({
      publish,
      supportsThreads: false,
    });
    const post = createScheduledPost({ retryCount: 3 });

    await executeDelivery(mocks, post, 'scheduled_sweep');
    expect(publish).toHaveBeenCalledTimes(1);

    // Every later delivery finds the timeout's uncertain receipt.
    mocks.prisma.postProviderPublishReceipt.findFirst.mockResolvedValue(
      receiptRow({ status: 'uncertain' }),
    );
    for (let delivery = 0; delivery < 5; delivery++) {
      const result = await executeDelivery(mocks, post, 'scheduled_sweep');
      expect(result.executionState).toBe(TargetExecutionState.PUBLISHING);
    }

    expect(publish).toHaveBeenCalledTimes(1);
    expect(
      mocks.schedulerPublishStateService.transitionPost.mock.calls.map(
        (call) => call[1].executionState,
      ),
    ).not.toContain(TargetExecutionState.FAILED);
  });

  it('never calls a verifying publisher again while its verification is unavailable, at any retry count', async () => {
    const publish = vi
      .fn()
      .mockRejectedValue(
        new PublishError(PublishErrorKind.OUTCOME_UNKNOWN, 'ETIMEDOUT'),
      );
    mocks.publisherFactory.getPublisher.mockReturnValue({
      publish,
      supportsThreads: false,
      verifyPublished: vi.fn().mockRejectedValue(new Error('provider 503')),
    });
    const post = createScheduledPost({ retryCount: 3 });

    await executeDelivery(mocks, post, 'scheduled_sweep');
    expect(publish).toHaveBeenCalledTimes(1);

    mocks.prisma.postProviderPublishReceipt.findFirst.mockResolvedValue(
      receiptRow({ status: 'uncertain' }),
    );
    for (let delivery = 0; delivery < 5; delivery++) {
      const result = await executeDelivery(mocks, post, 'scheduled_sweep');
      expect(result.executionState).toBe(TargetExecutionState.PUBLISHING);
    }

    expect(publish).toHaveBeenCalledTimes(1);
    expect(
      mocks.schedulerPublishStateService.transitionPost.mock.calls.map(
        (call) => call[1].executionState,
      ),
    ).not.toContain(TargetExecutionState.FAILED);
  });

  it('fails a confirmed-absent occurrence at retry exhaustion without another provider call, fenced on the claimed receipt', async () => {
    const publish = vi.fn();
    mocks.publisherFactory.getPublisher.mockReturnValue({
      publish,
      supportsThreads: false,
      verifyPublished: vi.fn().mockResolvedValue(null),
    });
    mocks.prisma.postProviderPublishReceipt.findFirst.mockResolvedValue(
      receiptRow({ status: 'uncertain' }),
    );

    const result = await executeDelivery(
      mocks,
      createScheduledPost({ retryCount: 3 }),
      'scheduled_sweep',
    );

    expect(publish).not.toHaveBeenCalled();
    expect(result.executionState).toBe(TargetExecutionState.FAILED);
    expect(
      mocks.schedulerPublishStateService.transitionPost,
    ).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ executionState: TargetExecutionState.FAILED }),
      expect.any(String),
      expect.objectContaining({
        expectedProviderAttempt: {
          attemptToken: expect.any(String),
          receiptId: 'receipt-1',
        },
      }),
    );
  });

  it('never moves the verification window anchor when it defers', async () => {
    mocks.publisherFactory.getPublisher.mockReturnValue({
      publish: vi.fn(),
      supportsThreads: false,
      verifyPublished: vi.fn().mockRejectedValue(new Error('provider 503')),
    });
    mocks.prisma.postProviderPublishReceipt.findFirst.mockResolvedValue(
      receiptRow({
        attemptStartedAt: new Date(Date.now() - 25 * 60 * 60_000),
        status: 'uncertain',
      }),
    );

    for (let delivery = 0; delivery < 3; delivery++) {
      await executeDelivery(mocks, createScheduledPost(), 'scheduled_sweep');
    }

    // Deferring writes no receipt, so the anchor stays the first attempt.
    expect(
      mocks.prisma.postProviderPublishReceipt.updateMany,
    ).not.toHaveBeenCalled();
    const codes = mocks.schedulerPublishStateService.transitionPost.mock.calls
      .map((call) => call[1].error?.code)
      .filter(Boolean);
    expect(codes).toEqual(Array(3).fill('publish_outcome_unverified'));
  });

  it('surfaces an unverified outcome once the verification window passed, still publishing', async () => {
    mocks.publisherFactory.getPublisher.mockReturnValue({
      publish: vi.fn(),
      supportsThreads: false,
      verifyPublished: vi.fn().mockRejectedValue(new Error('provider 503')),
    });
    mocks.prisma.postProviderPublishReceipt.findFirst.mockResolvedValue(
      receiptRow({
        attemptStartedAt: new Date(Date.now() - 25 * 60 * 60_000),
        status: 'uncertain',
      }),
    );

    await executeDelivery(mocks, createScheduledPost(), 'scheduled_sweep');

    const calls = mocks.schedulerPublishStateService.transitionPost.mock.calls;
    expect(calls.map((call) => call[1].executionState)).not.toContain(
      TargetExecutionState.FAILED,
    );
    expect(calls.find((call) => call[1].error)?.[1]).toEqual(
      expect.objectContaining({
        error: expect.objectContaining({
          code: 'publish_outcome_unverified',
        }),
        executionState: TargetExecutionState.PUBLISHING,
      }),
    );
  });

  it('tells the owner once, naming the post and the channel, when the verification window passes', async () => {
    mocks.activitiesService.record.mockClear();
    mocks.publisherFactory.getPublisher.mockReturnValue({
      publish: vi.fn(),
      supportsThreads: false,
      verifyPublished: vi.fn().mockRejectedValue(new Error('provider 503')),
    });
    const attemptStartedAt = new Date(Date.now() - 25 * 60 * 60_000);
    mocks.prisma.postProviderPublishReceipt.findFirst.mockResolvedValue(
      receiptRow({ attemptStartedAt, status: 'uncertain' }),
    );

    for (let delivery = 0; delivery < 3; delivery++) {
      await executeDelivery(mocks, createScheduledPost(), 'scheduled_sweep');
    }

    const recorded = mocks.activitiesService.record.mock.calls.map(
      (call) => call[0],
    );
    expect(recorded).toHaveLength(3);
    expect(
      new Set(recorded.map((activity) => activity.alert?.deduplicationKey)),
    ).toEqual(
      new Set([
        `${ActivityKey.POST_PUBLISH_UNVERIFIED}/post-1/${attemptStartedAt.getTime()}`,
      ]),
    );
    expect(recorded[0]).toEqual(
      expect.objectContaining({
        entityId: 'post-1',
        key: ActivityKey.POST_PUBLISH_UNVERIFIED,
        organizationId: 'org-1',
        userId: 'user-1',
      }),
    );
    expect(recorded[0].alert?.payload).toEqual(
      expect.objectContaining({
        event: 'publish_unverified',
        kind: 'alert_email',
        summary: expect.stringContaining('Check your'),
      }),
    );
  });

  it('tells the owner nothing while the outcome is still inside the verification window', async () => {
    mocks.activitiesService.record.mockClear();
    mocks.publisherFactory.getPublisher.mockReturnValue({
      publish: vi.fn(),
      supportsThreads: false,
      verifyPublished: vi.fn().mockRejectedValue(new Error('provider 503')),
    });
    mocks.prisma.postProviderPublishReceipt.findFirst.mockResolvedValue(
      receiptRow({
        attemptStartedAt: new Date(Date.now() - 60 * 60_000),
        status: 'uncertain',
      }),
    );

    await executeDelivery(mocks, createScheduledPost(), 'scheduled_sweep');

    expect(mocks.activitiesService.record).not.toHaveBeenCalled();
  });

  it('keeps a budget-exhausted ambiguous provider call publishing instead of failing it', async () => {
    mocks.publisherFactory.getPublisher.mockReturnValue({
      publish: vi
        .fn()
        .mockRejectedValue(
          new PublishError(PublishErrorKind.OUTCOME_UNKNOWN, 'ETIMEDOUT'),
        ),
      supportsThreads: false,
    });

    await executeDelivery(
      mocks,
      createScheduledPost({ retryCount: 3 }),
      'scheduled_sweep',
    );

    expect(
      mocks.prisma.postProviderPublishReceipt.updateMany,
    ).toHaveBeenCalledWith({
      data: { status: 'uncertain' },
      where: receiptWhere,
    });
    expect(
      mocks.schedulerPublishStateService.transitionPost.mock.calls.map(
        (call) => call[1].executionState,
      ),
    ).not.toContain(TargetExecutionState.FAILED);
  });

  it('keeps a returned timeout uncertain instead of releasing it', async () => {
    mockSuccessfulPublisher(mocks, {
      error: 'ETIMEDOUT while publishing',
      errorKind: PublishErrorKind.OUTCOME_UNKNOWN,
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
    const receipts = mocks.prisma.postProviderPublishReceipt;
    expect(receipts.create.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.quotaService.checkQuota.mock.invocationCallOrder[0],
    );
    expect(receipts.updateMany).toHaveBeenCalledWith({
      data: { status: 'released' },
      where: receiptWhere,
    });
  });

  it('never fails the target while another delivery holds the occurrence', async () => {
    mockSuccessfulPublisher(mocks);
    mocks.quotaService.checkQuota.mockResolvedValue({
      allowed: false,
      currentCount: 10,
      dailyLimit: 10,
    });
    mocks.prisma.postProviderPublishReceipt.findFirst.mockResolvedValue(
      receiptRow({
        leaseRenewedAt: new Date(),
        workflowExecutionId: 'other',
      }),
    );

    await expect(
      executeDelivery(mocks, createScheduledPost(), 'scheduled_sweep'),
    ).rejects.toThrow('Another delivery is publishing this post occurrence.');
    expect(mocks.quotaService.checkQuota).not.toHaveBeenCalled();
    const states =
      mocks.schedulerPublishStateService.transitionPost.mock.calls.map(
        (call) => call[1].executionState,
      );
    expect(states).not.toContain(TargetExecutionState.FAILED);
  });

  it('persists an accepted occurrence when its recovery lookups fail', async () => {
    const publish = mockSuccessfulPublisher(mocks);
    mocks.credentialsService.findOne.mockRejectedValue(
      new Error('credential store unavailable'),
    );
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

  it('releases a taken-over attempt when a gate fails after its absence is confirmed', async () => {
    const publish = vi.fn();
    mocks.publisherFactory.getPublisher.mockReturnValue({
      publish,
      supportsThreads: false,
      verifyPublished: vi.fn().mockResolvedValue(null),
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
    expect(
      mocks.prisma.postProviderPublishReceipt.updateMany,
    ).toHaveBeenLastCalledWith({
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
        leaseRenewedAt: new Date(),
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

  it('keeps an in-flight occurrence publishing when the workflow fails', async () => {
    mocks.prisma.postProviderPublishReceipt.findFirst.mockResolvedValue(
      receiptRow({ leaseRenewedAt: new Date(), workflowExecutionId: 'other' }),
    );

    const result = await service.failTerminalValidation(
      createScheduledPost() as never,
      new Error('Scheduled publish workflow failed before finalization.'),
    );

    expect(result.executionState).toBe(TargetExecutionState.PUBLISHING);
    expect(
      mocks.schedulerPublishStateService.transitionPost,
    ).not.toHaveBeenCalled();
  });

  it('holds the occurrence while it fails the target, then releases it', async () => {
    await service.failTerminalValidation(
      createScheduledPost() as never,
      new Error('Canonical Post digest no longer matches pin.'),
    );

    const receipts = mocks.prisma.postProviderPublishReceipt;
    const failedWrite =
      mocks.schedulerPublishStateService.transitionPost.mock
        .invocationCallOrder[0];
    expect(receipts.create.mock.invocationCallOrder[0]).toBeLessThan(
      failedWrite,
    );
    expect(receipts.updateMany).toHaveBeenCalledWith({
      data: { status: 'released' },
      where: receiptWhere,
    });
    const releaseIndex = receipts.updateMany.mock.calls.findIndex(
      ([args]) => args.data.status === 'released',
    );
    expect(
      receipts.updateMany.mock.invocationCallOrder[releaseIndex],
    ).toBeGreaterThan(failedWrite);
  });

  it('never fails the target once its terminal-failure hold was taken over', async () => {
    mocks.prisma.postProviderPublishReceipt.updateMany.mockResolvedValue({
      count: 0,
    });

    const result = await service.failTerminalValidation(
      createScheduledPost() as never,
      new Error('Canonical Post digest no longer matches pin.'),
    );

    expect(result.executionState).toBe(TargetExecutionState.PUBLISHING);
    expect(
      mocks.schedulerPublishStateService.transitionPost,
    ).not.toHaveBeenCalled();
  });

  it('skips the failure webhook and reports PUBLISHING when the fenced FAILED transition is rejected', async () => {
    mocks.schedulerPublishStateService.transitionPost.mockResolvedValue(false);

    const result = await service.failTerminalValidation(
      createScheduledPost() as never,
      new Error('Canonical Post digest no longer matches pin.'),
    );

    expect(result.executionState).toBe(TargetExecutionState.PUBLISHING);
    expect(
      mocks.publishEventWebhookService.emitPostFailed,
    ).not.toHaveBeenCalled();
  });

  it('fences the terminal FAILED write on the owned receipt so a takeover after renewal never ends FAILED', async () => {
    await service.failTerminalValidation(
      createScheduledPost() as never,
      new Error('Canonical Post digest no longer matches pin.'),
    );

    expect(
      mocks.schedulerPublishStateService.transitionPost,
    ).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ executionState: TargetExecutionState.FAILED }),
      expect.any(String),
      expect.objectContaining({
        expectedProviderAttempt: {
          attemptToken: expect.any(String),
          receiptId: 'receipt-1',
        },
      }),
    );
  });

  it('fences the terminal FAILED write on a still-queued target', async () => {
    await service.failTerminalValidation(
      createScheduledPost() as never,
      new Error('Canonical Post digest no longer matches pin.'),
    );

    expect(
      mocks.schedulerPublishStateService.transitionPost,
    ).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ executionState: TargetExecutionState.FAILED }),
      expect.any(String),
      expect.objectContaining({
        priorExecutionStates: [
          TargetExecutionState.SCHEDULED,
          TargetExecutionState.PUBLISHING,
        ],
      }),
    );
  });

  it('keeps an unconfirmed occurrence publishing when the workflow fails', async () => {
    mocks.prisma.postProviderPublishReceipt.findFirst.mockResolvedValue(
      receiptRow({ status: 'uncertain' }),
    );

    const result = await service.failTerminalValidation(
      createScheduledPost() as never,
      new Error('workflow failed'),
    );

    expect(result.executionState).toBe(TargetExecutionState.PUBLISHING);
    expect(
      mocks.schedulerPublishStateService.transitionPost,
    ).not.toHaveBeenCalled();
    expect(
      mocks.prisma.postProviderPublishReceipt.updateMany,
    ).not.toHaveBeenCalled();
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
      mocks.publishEventWebhookService.emitPostFailed,
    ).not.toHaveBeenCalled();
  });

  it('carries the provider shortcode into the publish webhook', async () => {
    mockSuccessfulPublisher(mocks, {
      externalShortcode: 'tweet-short',
    });
    const post = createScheduledPost();

    await executeDelivery(mocks, post, 'scheduled_sweep');

    expect(
      mocks.publishEventWebhookService.emitPostPublished,
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
      mocks.publishEventWebhookService.emitPostPublished,
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
      targetSettings: { privacyLevel: 'public', musicUsageAccepted: true },
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

  it.each([
    ['scheduled_sweep', { deliveryMode: 'tiktok_app' }, true],
    ['scheduled_sweep', {}, false],
  ])(
    'a TikTok post retried from %s with %j hands off to the TikTok app: %s',
    async (source, delivery, isHandoff) => {
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
        targetSettings: {
          ...delivery,
          musicUsageAccepted: true,
          privacyLevel: 'public',
        },
      });

      await executeDelivery(mocks, post, source as 'scheduled_sweep');

      const [{ settings }] = publish.mock.calls[0];
      expect(settings[TIKTOK_APP_HANDOFF_SETTING] === true).toBe(isHandoff);
    },
  );

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
        errorKind: PublishErrorKind.RATE_LIMITED,
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
        retryCount: 0,
        workflowExecutionId: 'execution-1',
      }),
      expect.stringMatching(/^429 rate limit Next attempt at \d{4}-/),
      {
        expectedWorkflowExecutionId: 'execution-1',
        priorExecutionStates: [TargetExecutionState.PUBLISHING],
      },
    );
    expect(
      mocks.publishEventWebhookService.emitPostFailed,
    ).not.toHaveBeenCalled();
  });

  describe('provider token and grant failures', () => {
    function mockPublisherThrowing(kind: PublishErrorKind) {
      const publish = vi
        .fn()
        .mockRejectedValue(new PublishError(kind, 'Provider said no'));
      mocks.publisherFactory.getPublisher.mockReturnValue({
        publish,
        supportsThreads: false,
      });
      return publish;
    }

    function lastWrite() {
      const writes =
        mocks.schedulerPublishStateService.transitionPost.mock.calls
          .map((call) => call[1])
          .filter(
            (update) =>
              update.executionState === TargetExecutionState.SCHEDULED ||
              update.executionState === TargetExecutionState.FAILED,
          );
      return writes[writes.length - 1];
    }

    it('refreshes an expired token once and publishes again without using up an attempt', async () => {
      mockPublisherThrowing(PublishErrorKind.TOKEN_MUST_REFRESH);

      await executeDelivery(
        mocks,
        createScheduledPost({ retryCount: 2 }),
        'scheduled_sweep',
      );

      const write = lastWrite();
      expect(mocks.credentialRefresher.refreshCredential).toHaveBeenCalledTimes(
        1,
      );
      expect(write).toMatchObject({
        error: { code: 'token_refreshed', isRetryable: true },
        executionState: TargetExecutionState.SCHEDULED,
        retryCount: 2,
      });
      // Due on the next sweep, not after the usual backoff.
      expect(Date.now() - write.lastAttemptAt.getTime()).toBeGreaterThanOrEqual(
        60 * 1000,
      );
      expect(
        mocks.publishEventWebhookService.emitPostFailed,
      ).not.toHaveBeenCalled();
    });

    it('disconnects the channel and tells the owner when the token is refused again after a refresh', async () => {
      mockPublisherThrowing(PublishErrorKind.TOKEN_MUST_REFRESH);
      mocks.credentialsService.findOne.mockResolvedValue({
        externalHandle: '@brand',
        id: 'cred-1',
        isConnected: true,
        organizationId: 'org-1',
        platform: CredentialPlatform.TWITTER,
        userId: 'user-1',
      });

      await executeDelivery(
        mocks,
        createScheduledPost({
          targetError: { code: 'token_refreshed', isRetryable: true },
        }),
        'scheduled_sweep',
      );

      expect(
        mocks.credentialRefresher.refreshCredential,
      ).not.toHaveBeenCalled();
      expect(mocks.credentialsService.patch).toHaveBeenCalledWith('cred-1', {
        isConnected: false,
      });
      expect(mocks.activitiesService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          alert: {
            payload: expect.objectContaining({
              event: 'channel_disconnected',
              label: '@brand',
            }),
          },
          key: ActivityKey.SOCIAL_INTEGRATION_DISCONNECTED,
        }),
      );
      expect(lastWrite()).toMatchObject({
        error: { code: 'channel_disconnected', isRetryable: false },
        executionState: TargetExecutionState.FAILED,
      });
    });

    it('disconnects the channel when the provider says the grant is revoked, without refreshing', async () => {
      mockPublisherThrowing(PublishErrorKind.CHANNEL_DISCONNECTED);
      mocks.credentialsService.findOne.mockResolvedValue({
        id: 'cred-1',
        isConnected: true,
        organizationId: 'org-1',
        platform: CredentialPlatform.TWITTER,
      });

      await executeDelivery(mocks, createScheduledPost(), 'scheduled_sweep');

      expect(
        mocks.credentialRefresher.refreshCredential,
      ).not.toHaveBeenCalled();
      expect(mocks.credentialsService.patch).toHaveBeenCalledWith('cred-1', {
        isConnected: false,
      });
      expect(lastWrite().executionState).toBe(TargetExecutionState.FAILED);
    });

    it('disconnects the channel when the refresh itself fails', async () => {
      mockPublisherThrowing(PublishErrorKind.TOKEN_MUST_REFRESH);
      mocks.credentialRefresher.refreshCredential.mockResolvedValue({
        success: false,
      });
      mocks.credentialsService.findOne.mockResolvedValue({
        id: 'cred-1',
        isConnected: true,
        organizationId: 'org-1',
        platform: CredentialPlatform.TWITTER,
      });

      await executeDelivery(mocks, createScheduledPost(), 'scheduled_sweep');

      expect(lastWrite().executionState).toBe(TargetExecutionState.FAILED);
    });

    it('fails a rejected post at once with the provider reason and no retry', async () => {
      mockPublisherThrowing(PublishErrorKind.CONTENT_REJECTED);

      await executeDelivery(
        mocks,
        createScheduledPost({ retryCount: 0 }),
        'scheduled_sweep',
      );

      expect(lastWrite()).toMatchObject({
        error: {
          code: 'content_rejected',
          isRetryable: false,
          message: 'Provider said no',
        },
        executionState: TargetExecutionState.FAILED,
      });
    });
  });

  describe('provider outcomes that end a post', () => {
    function mockPublisherThrowing(error: PublishError) {
      const publish = vi.fn().mockRejectedValue(error);
      mocks.publisherFactory.getPublisher.mockReturnValue({
        publish,
        supportsThreads: false,
      });
      return publish;
    }

    function failedWrite() {
      return mocks.schedulerPublishStateService.transitionPost.mock.calls
        .map((call) => call[1])
        .find(
          (update) => update.executionState === TargetExecutionState.FAILED,
        );
    }

    it('stops at once on an exhausted provider balance, with one provider call and a warning', async () => {
      const publish = mockPublisherThrowing(
        new PublishError(
          PublishErrorKind.PROVIDER_CREDITS_DEPLETED,
          'X API credits depleted. Add credits to the X developer account, then retry.',
        ),
      );

      await executeDelivery(
        mocks,
        createScheduledPost({ retryCount: 0 }),
        'scheduled_sweep',
      );

      expect(publish).toHaveBeenCalledTimes(1);
      expect(failedWrite()).toMatchObject({
        error: {
          code: 'provider_credits_depleted',
          isRetryable: false,
        },
      });
      expect(mocks.logger.error).not.toHaveBeenCalled();
    });

    it('fails a duplicate X post under its own code without retrying it', async () => {
      const publish = mockPublisherThrowing(
        new PublishError(
          PublishErrorKind.CONTENT_REJECTED,
          'You are not allowed to create a Tweet with duplicate content.',
          { httpStatus: 403, providerCode: 'duplicate_content' },
        ),
      );

      await executeDelivery(
        mocks,
        createScheduledPost({ retryCount: 0 }),
        'scheduled_sweep',
      );

      expect(publish).toHaveBeenCalledTimes(1);
      expect(failedWrite()).toMatchObject({
        error: { code: 'duplicate_content', isRetryable: false },
      });
      expect(mocks.logger.error).not.toHaveBeenCalled();
    });

    it('still logs an error for a failure the provider never explained', async () => {
      mockPublisherThrowing(
        new Error('Cannot read properties of undefined') as PublishError,
      );

      await executeDelivery(mocks, createScheduledPost(), 'scheduled_sweep');

      expect(mocks.logger.error).toHaveBeenCalled();
    });
  });

  describe('provider rate limits', () => {
    function mockRateLimitedPublisher(retryAfterMs?: number) {
      const publish = vi.fn().mockResolvedValue({
        error: '429 rate limit',
        errorKind: PublishErrorKind.RATE_LIMITED,
        executionState: TargetExecutionState.FAILED,
        externalId: null,
        platform: CredentialPlatform.TWITTER,
        retryAfterMs,
        success: false,
        url: '',
      });
      mocks.publisherFactory.getPublisher.mockReturnValue({
        publish,
        supportsThreads: false,
      });
      return publish;
    }

    function lastScheduledWrite() {
      const writes =
        mocks.schedulerPublishStateService.transitionPost.mock.calls
          .map((call) => call[1])
          .filter(
            (update) =>
              update.executionState === TargetExecutionState.SCHEDULED,
          );
      return writes[writes.length - 1];
    }

    it('waits for the reset the provider named without spending a retry', async () => {
      mockRateLimitedPublisher(30 * 60 * 1000);
      const before = Date.now();

      await executeDelivery(
        mocks,
        createScheduledPost({ retryCount: 1 }),
        'scheduled_sweep',
      );

      const write = lastScheduledWrite();
      expect(write.retryCount).toBe(1);
      // The sweep retries 60s after lastAttemptAt, so the post is next due at
      // the reset: 30 minutes out.
      const dueAt = write.lastAttemptAt.getTime() + 60 * 1000;
      expect(dueAt).toBeGreaterThanOrEqual(before + 30 * 60 * 1000);
      expect(dueAt).toBeLessThanOrEqual(Date.now() + 30 * 60 * 1000);
      expect(write.error.message).toContain('Next attempt at');
      expect(
        mocks.publishEventWebhookService.emitPostFailed,
      ).not.toHaveBeenCalled();
    });

    it('waits the default when the provider gave no reset, and never longer than the cap', async () => {
      mockRateLimitedPublisher();
      await executeDelivery(mocks, createScheduledPost(), 'scheduled_sweep');
      const defaultDueAt = lastScheduledWrite().lastAttemptAt.getTime() + 60000;
      expect(defaultDueAt - Date.now()).toBeGreaterThan(14 * 60 * 1000);
      expect(defaultDueAt - Date.now()).toBeLessThanOrEqual(15 * 60 * 1000);

      mocks.schedulerPublishStateService.transitionPost.mockClear();
      mockRateLimitedPublisher(48 * 60 * 60 * 1000);
      await executeDelivery(mocks, createScheduledPost(), 'scheduled_sweep');
      const cappedDueAt = lastScheduledWrite().lastAttemptAt.getTime() + 60000;
      expect(cappedDueAt - Date.now()).toBeLessThanOrEqual(6 * 60 * 60 * 1000);
      expect(cappedDueAt - Date.now()).toBeGreaterThan(5 * 60 * 60 * 1000);
    });

    it('does not fail a post that is rate limited on every attempt within the give-up window', async () => {
      mockRateLimitedPublisher(60 * 1000);
      let post = createScheduledPost({ retryCount: 0 });

      for (let attempt = 0; attempt < 5; attempt++) {
        await executeDelivery(mocks, post, 'scheduled_sweep');
        const write = lastScheduledWrite();
        post = {
          ...post,
          retryCount: write.retryCount,
          targetError: write.error,
        };
      }

      expect(post.retryCount).toBe(0);
      expect(
        mocks.schedulerPublishStateService.transitionPost.mock.calls.map(
          (call) => call[1].executionState,
        ),
      ).not.toContain(TargetExecutionState.FAILED);
      expect(
        mocks.publishEventWebhookService.emitPostFailed,
      ).not.toHaveBeenCalled();
    });

    it('fails the post with rate_limited once it has been limited past the give-up window', async () => {
      mockRateLimitedPublisher(60 * 1000);
      const post = createScheduledPost({
        retryCount: 0,
        targetError: {
          code: 'rate_limited',
          failedAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
          isRetryable: true,
          message: '429 rate limit',
        },
      });

      const result = await executeDelivery(mocks, post, 'scheduled_sweep');

      expect(result.executionState).toBe(TargetExecutionState.FAILED);
      const failed =
        mocks.schedulerPublishStateService.transitionPost.mock.calls
          .map((call) => call[1])
          .find(
            (update) => update.executionState === TargetExecutionState.FAILED,
          );
      expect(failed.error.code).toBe('rate_limited');
      expect(failed.error.message).toContain(
        'Still rate limited by the provider after 24 hours.',
      );
    });

    it('keeps spending the retry budget on a failure that is not a rate limit', async () => {
      mocks.publisherFactory.getPublisher.mockReturnValue({
        publish: vi.fn().mockResolvedValue({
          error: '503 service unavailable',
          errorKind: PublishErrorKind.RETRY_LATER,
          executionState: TargetExecutionState.FAILED,
          externalId: null,
          platform: CredentialPlatform.TWITTER,
          success: false,
          url: '',
        }),
        supportsThreads: false,
      });

      await executeDelivery(
        mocks,
        createScheduledPost({ retryCount: 1 }),
        'scheduled_sweep',
      );

      expect(lastScheduledWrite().retryCount).toBe(2);
    });
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

  it('keeps a refused X quote failed and asks for it by hand instead of raising a publish failure', async () => {
    mocks.publisherFactory.getPublisher.mockReturnValue({
      publish: vi.fn().mockResolvedValue({
        error: 'X refused this quote post.',
        errorCode: 'x_quote_refused',
        executionState: TargetExecutionState.FAILED,
        externalId: null,
        platform: CredentialPlatform.TWITTER,
        success: false,
        url: '',
      }),
      supportsThreads: false,
    });
    const post = createScheduledPost({
      description: 'Shipped X quote scheduling.',
      groupId: 'group-1',
      quoteTweetId: '1856322244019101979',
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
          code: 'x_quote_refused',
          isRetryable: false,
        }),
        executionState: TargetExecutionState.FAILED,
      }),
      'X refused this quote post.',
      expect.anything(),
    );
    expect(mocks.activitiesService.record).toHaveBeenCalledTimes(1);
    expect(mocks.activitiesService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        entityId: 'post-1',
        key: ActivityKey.POST_MANUAL_POST_NEEDED,
        organizationId: 'org-1',
        userId: 'user-1',
        value: expect.stringContaining(
          'https://x.com/intent/post?text=Shipped+X+quote+scheduling.&url=https%3A%2F%2Fx.com%2Fi%2Fstatus%2F1856322244019101979',
        ),
      }),
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
      mocks.publishEventWebhookService.emitPostFailed,
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
      mocks.publishEventWebhookService.emitPostFailed,
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
      mocks.publishEventWebhookService.emitPostFailed,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        errorMessage: 'YouTube requires at least 1 media item(s).',
        post,
      }),
    );
  });

  it('publishes a scheduled text post on a connected Threads account', async () => {
    const publish = mockSuccessfulPublisher(mocks);
    mocks.credentialsService.findOne.mockResolvedValue({
      id: 'cred-1',
      platform: CredentialPlatform.THREADS,
    });
    const post = createScheduledPost({
      description: 'Shipping the new editor today.',
      platform: CredentialPlatform.THREADS,
    });

    const result = await executeDelivery(mocks, post, 'scheduled_sweep');

    expect(result).toEqual(
      expect.objectContaining({
        executionState: TargetExecutionState.PUBLISHED,
        success: true,
      }),
    );
    expect(publish).toHaveBeenCalledTimes(1);
  });

  it('refuses a Threads post over 500 characters before the provider call', async () => {
    const publish = mockSuccessfulPublisher(mocks);
    mocks.credentialsService.findOne.mockResolvedValue({
      id: 'cred-1',
      platform: CredentialPlatform.THREADS,
    });
    const post = createScheduledPost({
      description: 'x'.repeat(501),
      platform: CredentialPlatform.THREADS,
    });

    const result = await executeDelivery(mocks, post, 'scheduled_sweep');

    expect(publish).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        executionState: TargetExecutionState.FAILED,
        success: false,
      }),
    );
    expect(result.error).toMatch(/Threads/);
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
      mocks.publishEventWebhookService.emitPostFailed,
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
      mocks.publishEventWebhookService.emitPostFailed,
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
      mocks.publishEventWebhookService.emitPostFailed,
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
      mocks.publishEventWebhookService.emitPostFailed,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        errorMessage: 'Quota exceeded',
        platform: CredentialPlatform.TWITTER,
        post,
      }),
    );
  });

  it('refuses a post an organization scheduled before it paid, pointing at the plans', async () => {
    mocks.quotaService.checkQuota.mockResolvedValue({
      allowed: false,
      currentCount: 0,
      dailyLimit: 0,
      requiresPayment: true,
    });
    const post = createScheduledPost();

    const result = await executeDelivery(mocks, post, 'scheduled_sweep');

    expect(mocks.publisherFactory.getPublisher).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        error: expect.stringContaining('/onboarding/plans'),
        executionState: TargetExecutionState.FAILED,
        success: false,
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

  it('reports replies that are not SCHEDULED when the parent publishes', async () => {
    vi.mocked(Sentry.captureMessage).mockClear();
    mocks.prisma.post.findMany.mockResolvedValue([
      { id: 'reply-1', targetExecutionState: TargetExecutionState.FAILED },
    ]);
    mocks.publisherFactory.getPublisher.mockReturnValue({
      publish: vi.fn().mockResolvedValue({
        executionState: TargetExecutionState.PUBLISHED,
        externalId: 'tweet-1',
        platform: CredentialPlatform.TWITTER,
        success: true,
        url: 'https://x.com/example/status/tweet-1',
      }),
      publishThreadChildren: vi.fn(),
      supportsThreads: true,
    });

    await executeDelivery(mocks, createScheduledPost(), 'scheduled_sweep');

    expect(mocks.logger.error).toHaveBeenCalledWith(
      expect.stringContaining('thread replies were not SCHEDULED'),
      expect.objectContaining({
        childPostIds: ['reply-1'],
        states: [TargetExecutionState.FAILED],
      }),
    );
    expect(Sentry.captureMessage).toHaveBeenCalledTimes(1);
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
      mocks.publishEventWebhookService.emitPostPublished,
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
      {
        expectedProviderAttempt: {
          attemptToken: expect.any(String),
          receiptId: 'receipt-1',
        },
        priorExecutionStates: [
          TargetExecutionState.SCHEDULED,
          TargetExecutionState.PUBLISHING,
        ],
      },
    );
    expect(
      mocks.publishEventWebhookService.emitPostFailed,
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
      expect(mocks.logger.warn).toHaveBeenCalledWith(
        'Durable validation rejected queued publishing',
        expect.objectContaining({ error: expectedMessage }),
      );
    },
  );

  describe('breakout response dispatch fence', () => {
    it('re-admits the stored post after the reservation and right before the provider call', async () => {
      const publish = mockSuccessfulPublisher(mocks);

      const result = await executeDelivery(
        mocks,
        createScheduledPost({ quoteTweetId: 'tweet-source' }),
        'scheduled_sweep',
      );

      expect(result.success).toBe(true);
      expect(assertBreakoutPublicationDispatch).toHaveBeenCalledOnce();
      expect(assertBreakoutPublicationDispatch).toHaveBeenCalledWith(
        mocks.prisma,
        { organizationId: 'org-1', postId: 'post-1' },
      );
      expect(
        mocks.prisma.postProviderPublishReceipt.create.mock
          .invocationCallOrder[0],
      ).toBeLessThan(
        vi.mocked(assertBreakoutPublicationDispatch).mock
          .invocationCallOrder[0],
      );
      expect(
        vi.mocked(assertBreakoutPublicationDispatch).mock
          .invocationCallOrder[0],
      ).toBeLessThan(publish.mock.invocationCallOrder[0]);
    });

    it.each([
      [
        'a lost actor',
        new ForbiddenException('Breakout execution denied'),
        'Breakout execution denied',
      ],
      [
        'faded growth',
        new BusinessLogicException('Breakout publication held: growth_faded'),
        'Breakout publication held: growth_faded',
      ],
      [
        'a changed quote link',
        new BusinessLogicException(
          'Breakout publication held: quote_binding_changed',
        ),
        'Breakout publication held: quote_binding_changed',
      ],
    ])(
      'releases the reservation and never reaches the provider after %s',
      async (_name, hold, message) => {
        const publish = mockSuccessfulPublisher(mocks);
        vi.mocked(assertBreakoutPublicationDispatch).mockRejectedValue(hold);
        const post = createScheduledPost({ quoteTweetId: 'tweet-source' });

        const result = await executeDelivery(mocks, post, 'scheduled_sweep');

        expect(publish).not.toHaveBeenCalled();
        expect(result).toEqual(
          expect.objectContaining({
            error: message,
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
              code: 'breakout_publication_held',
              isRetryable: false,
              message,
            }),
            executionState: TargetExecutionState.FAILED,
          }),
          message,
          undefined,
        );
        expect(
          mocks.prisma.postProviderPublishReceipt.updateMany,
        ).toHaveBeenCalledWith({
          data: { status: 'released' },
          where: receiptWhere,
        });
        expect(
          mocks.prisma.postProviderPublishReceipt.updateMany,
        ).not.toHaveBeenCalledWith({
          data: expect.objectContaining({ status: 'accepted' }),
          where: receiptWhere,
        });
      },
    );

    it('treats an infrastructure failure as a retryable publish error, not a hold', async () => {
      const publish = mockSuccessfulPublisher(mocks);
      vi.mocked(assertBreakoutPublicationDispatch).mockRejectedValue(
        new Error('connection reset'),
      );

      await executeDelivery(mocks, createScheduledPost(), 'scheduled_sweep');

      expect(publish).not.toHaveBeenCalled();
      expect(
        mocks.schedulerPublishStateService.transitionPost,
      ).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          error: expect.objectContaining({ code: 'breakout_publication_held' }),
        }),
        expect.anything(),
        undefined,
      );
      expect(
        mocks.prisma.postProviderPublishReceipt.updateMany,
      ).toHaveBeenCalledWith({
        data: { status: 'released' },
        where: receiptWhere,
      });
    });

    describe('when the fence denies the entry into PUBLISHING', () => {
      const denial = new BusinessLogicException(
        'Breakout publication held: growth_faded',
      );

      it.each([
        ['a hold', denial],
        ['a lost actor', new ForbiddenException('Breakout execution denied')],
      ])(
        'fails the target for good after %s instead of throwing into the sweep',
        async (_name, hold) => {
          const publish = mockSuccessfulPublisher(mocks);
          mocks.schedulerPublishStateService.transitionPost.mockRejectedValueOnce(
            hold,
          );
          const post = createScheduledPost({
            breakoutOutputId: 'output-1',
          });

          const result = await executeDelivery(mocks, post, 'scheduled_sweep');

          expect(result).toEqual(
            expect.objectContaining({
              error: hold.message,
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
                code: 'breakout_publication_held',
                isRetryable: false,
              }),
              executionState: TargetExecutionState.FAILED,
            }),
            hold.message,
            undefined,
          );
          expect(publish).not.toHaveBeenCalled();
          expect(
            mocks.prisma.postProviderPublishReceipt.create,
          ).not.toHaveBeenCalled();
        },
      );

      it('keeps the retry path for an infrastructure error', async () => {
        const publish = mockSuccessfulPublisher(mocks);
        mocks.schedulerPublishStateService.transitionPost.mockRejectedValueOnce(
          new Error('connection reset'),
        );

        await expect(
          executeDelivery(
            mocks,
            createScheduledPost({ breakoutOutputId: 'output-1' }),
            'scheduled_sweep',
          ),
        ).rejects.toThrow('connection reset');
        expect(publish).not.toHaveBeenCalled();
      });

      it('leaves a hold on an ordinary post to its own error path', async () => {
        mockSuccessfulPublisher(mocks);
        mocks.schedulerPublishStateService.transitionPost.mockRejectedValueOnce(
          denial,
        );

        await expect(
          executeDelivery(mocks, createScheduledPost(), 'scheduled_sweep'),
        ).rejects.toThrow(denial.message);
      });
    });

    it('does not re-admit a replayed, already accepted occurrence', async () => {
      const publish = mockSuccessfulPublisher(mocks);
      mocks.prisma.postProviderPublishReceipt.findFirst.mockResolvedValue(
        receiptRow({ result: acceptedTweet, status: 'accepted' }),
      );
      vi.mocked(assertBreakoutPublicationDispatch).mockRejectedValue(
        new ForbiddenException('Breakout execution denied'),
      );

      await executeDelivery(mocks, createScheduledPost(), 'scheduled_sweep');

      expect(publish).not.toHaveBeenCalled();
      expect(assertBreakoutPublicationDispatch).not.toHaveBeenCalled();
    });
  });
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

  it('stores the narrower audience a provider applied and skips public finalization', async () => {
    const mocks = createDeliveryMocks();
    createDeliveryService(mocks);
    mocks.credentialsService.findOne.mockResolvedValue({
      id: 'cred-1',
      platform: CredentialPlatform.YOUTUBE,
    });
    mocks.publisherFactory.getPublisher.mockReturnValue({
      publish: vi.fn().mockResolvedValue({
        success: true,
        externalId: 'provider-1',
        executionState: TargetExecutionState.PUBLISHED,
        platform: CredentialPlatform.YOUTUBE,
        url: 'https://example.com/provider-1',
        visibility: PostVisibility.PRIVATE,
      }),
    });
    await executeDelivery(
      mocks,
      createScheduledPost({
        visibility: PostVisibility.PUBLIC,
        platform: CredentialPlatform.YOUTUBE,
        ingredients: [{ category: IngredientCategory.VIDEO, id: 'video-1' }],
      }),
      'publish_now',
    );
    const terminal =
      mocks.schedulerPublishStateService.transitionPost.mock.calls.find(
        (call) => call[1].executionState === TargetExecutionState.PUBLISHED,
      );
    expect(terminal?.[1].visibility).toBe(PostVisibility.PRIVATE);
    expect(terminal?.[4]).toBeUndefined();
  });

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
