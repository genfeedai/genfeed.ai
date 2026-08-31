import {
  ActivityKey,
  CredentialPlatform,
  PostStatus,
  TargetExecutionState,
} from '@genfeedai/enums';
import type { IPublishingProviderReadiness } from '@genfeedai/interfaces';
import {
  type PublishResult,
  TIKTOK_APP_HANDOFF_SETTING,
  WORKFLOW_APPROVED_SCHEDULE_SETTING,
} from '@genfeedai/server';
import {
  SCHEDULED_POST_ACTION_IDS,
  type ScheduledPostWorkflowSource,
} from '@server/collections/posts/services/scheduled-post-workflow-definition';
import { BeehiivProviderError } from '@server/services/integrations/beehiiv/errors/beehiiv-provider.error';
import { ScheduledPostDeliveryService } from '@workers/services/scheduled-post-delivery.service';

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

type RegisteredAction = (request: {
  input: Record<string, unknown>;
  provenance: {
    executionId: string;
    workflowId: string;
    workflowLabel: string;
  };
}) => Promise<unknown>;

function createDeliveryMocks() {
  const registeredActions = new Map<string, RegisteredAction>();
  return {
    activitiesService: { create: vi.fn().mockResolvedValue(undefined) },
    credentialsService: { findOne: vi.fn() },
    logger: { error: vi.fn(), log: vi.fn(), warn: vi.fn() },
    organizationsService: {
      findOne: vi.fn().mockResolvedValue({ id: 'org-1' }),
    },
    postsService: { patch: vi.fn().mockResolvedValue(undefined) },
    prisma: {
      credential: { findMany: vi.fn() },
      post: { findFirst: vi.fn() },
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
    registeredActions,
    systemWorkflowRunner: {
      registerAction: vi.fn((actionId: string, action: RegisteredAction) => {
        registeredActions.set(actionId, action);
      }),
    },
  };
}

function createDeliveryService(mocks: DeliveryMocks) {
  const service = new ScheduledPostDeliveryService(
    mocks.logger as never,
    mocks.activitiesService as never,
    mocks.credentialsService as never,
    mocks.organizationsService as never,
    mocks.postsService as never,
    mocks.quotaService as never,
    mocks.publisherFactory as never,
    mocks.systemWorkflowRunner as never,
    mocks.publishEventWebhookService as never,
    mocks.schedulerPublishStateService as never,
    mocks.replyInboundQueueService as never,
    mocks.publishingReadinessService as never,
    mocks.prisma as never,
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
    expect(mocks.activitiesService.create).toHaveBeenCalledWith(
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
    expect(mocks.postsService.patch).not.toHaveBeenCalled();
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
    expect(mocks.postsService.patch).toHaveBeenCalledWith('child-1', {});
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
