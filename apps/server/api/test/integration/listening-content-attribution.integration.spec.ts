/**
 * Real-Postgres proof for listening evidence -> content -> release -> outcome.
 *
 * Only the provider collection and publish boundaries are mocked. Topic,
 * evidence, analysis, review, draft attribution, release approval/lifecycle,
 * analytics ingestion, and outcome projection use their production services
 * against the E2ETestModule Prisma connection.
 */

const describeWithDatabase =
  process.env.SKIP_PRISMA_DB === 'true' ? describe.skip : describe;

import { CredentialPublishingReadinessService } from '@api/collections/credentials/services/credential-publishing-readiness.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { ListeningTopicAnalysisService } from '@api/collections/listening-topics/services/listening-topic-analysis.service';
import { ListeningTopicAttributionService } from '@api/collections/listening-topics/services/listening-topic-attribution.service';
import { ListeningTopicCollectorService } from '@api/collections/listening-topics/services/listening-topic-collector.service';
import { ListeningTopicsService } from '@api/collections/listening-topics/services/listening-topics.service';
import { PostGroupContractService } from '@api/collections/post-groups/services/post-group-contract.service';
import { PostGroupPersistenceService } from '@api/collections/post-groups/services/post-group-persistence.service';
import { PostGroupReadinessService } from '@api/collections/post-groups/services/post-group-readiness.service';
import { PostGroupsService } from '@api/collections/post-groups/services/post-groups.service';
import { PostAnalyticsService } from '@api/collections/posts/services/post-analytics.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { PublishingProviderSetupService } from '@api/collections/publishing-setup/services/publishing-provider-setup.service';
import { SourcePostsService } from '@api/collections/source-posts/services/source-posts.service';
import {
  AgentArtifactReferenceService,
  PostLifecycleService,
  PublishApprovalsService,
} from '@api/index';
import { SourceCollectorService } from '@api/services/source-collector/source-collector.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  createTestBrand,
  createTestCredential,
  createTestMember,
  createTestOrganization,
  generateIdString,
} from '@api-test/e2e/e2e-test.utils';
import type { TestDatabaseHelper } from '@api-test/e2e-test.module';
import {
  createTestDatabaseHelper,
  E2ETestModule,
} from '@api-test/e2e-test.module';
import {
  CredentialPlatform,
  ListeningSourcePlatform,
  PostVisibility,
  SocialSourcePlatform,
  SourcePostActionType,
  TargetExecutionState,
  toPrismaCredentialPlatform,
} from '@genfeedai/contracts';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import type { ModuleRef } from '@nestjs/core';
import { Test, type TestingModule } from '@nestjs/testing';

type Fixture = {
  brandId: string;
  credentialId: string;
  organizationId: string;
  sourceId: string;
  userId: string;
};

type PublishOutbound = (input: { postId: string }) => Promise<{
  externalId: string;
  url: string;
}>;

type AttributionDatabase = {
  activity: { deleteMany: () => Promise<unknown> };
  contentVersionPin: { deleteMany: () => Promise<unknown> };
  listeningEvidence: {
    count: (args?: Record<string, unknown>) => Promise<number>;
    deleteMany: () => Promise<unknown>;
    findFirst: (args: Record<string, unknown>) => Promise<{
      id: string;
      sourcePostId: string | null;
    } | null>;
  };
  listeningSignal: { deleteMany: () => Promise<unknown> };
  listeningTheme: { deleteMany: () => Promise<unknown> };
  listeningThemeEvidence: { deleteMany: () => Promise<unknown> };
  listeningTopic: { deleteMany: () => Promise<unknown> };
  listeningTopicSource: { deleteMany: () => Promise<unknown> };
  post: {
    count: (args?: Record<string, unknown>) => Promise<number>;
    deleteMany: () => Promise<unknown>;
    updateMany: (args: Record<string, unknown>) => Promise<unknown>;
  };
  postAnalytics: {
    count: (args?: Record<string, unknown>) => Promise<number>;
    deleteMany: () => Promise<unknown>;
  };
  postGroup: {
    count: (args?: Record<string, unknown>) => Promise<number>;
    deleteMany: () => Promise<unknown>;
  };
  publishApproval: {
    count: (args?: Record<string, unknown>) => Promise<number>;
    deleteMany: () => Promise<unknown>;
  };
  socialSource: { deleteMany: () => Promise<unknown> };
  sourcePost: {
    count: (args?: Record<string, unknown>) => Promise<number>;
    deleteMany: () => Promise<unknown>;
    findFirst: (
      args: Record<string, unknown>,
    ) => Promise<{ id: string } | null>;
  };
};

describeWithDatabase('Listening content attribution lifecycle (#1798)', () => {
  let moduleRef: TestingModule;
  let dbHelper: TestDatabaseHelper;
  let prisma: PrismaService;
  let db: AttributionDatabase;
  let analysisService: ListeningTopicAnalysisService;
  let attributionService: ListeningTopicAttributionService;
  let collectorService: ListeningTopicCollectorService;
  let postAnalyticsService: PostAnalyticsService;
  let postGroupsService: PostGroupsService;
  let postLifecycleService: PostLifecycleService;
  let publishApprovalsService: PublishApprovalsService;
  let sourcePostsService: SourcePostsService;
  let topicsService: ListeningTopicsService;
  let collectTimeline: ReturnType<typeof vi.fn>;
  let publishOutbound: ReturnType<typeof vi.fn<PublishOutbound>>;
  let enqueuePublish: ReturnType<typeof vi.fn>;

  beforeAll(async () => {
    collectTimeline = vi.fn();
    publishOutbound = vi.fn<PublishOutbound>();
    enqueuePublish = vi.fn().mockResolvedValue('publish-job-1798');

    const moduleConfig = await E2ETestModule.forRoot({
      configOverrides: {
        GENFEEDAI_API_PUBLIC_URL: 'https://api.example.test',
        GENFEEDAI_APP_URL: 'https://app.example.test',
        TWITTER_CLIENT_ID: 'twitter-client-1798',
        TWITTER_CLIENT_SECRET: 'twitter-secret-1798',
        TWITTER_REDIRECT_URI: 'https://app.example.test/oauth/twitter',
      },
      providers: [
        CredentialsService,
        ListeningTopicAnalysisService,
        ListeningTopicAttributionService,
        ListeningTopicCollectorService,
        ListeningTopicsService,
        PostAnalyticsService,
        PostsService,
        SourcePostsService,
        {
          provide: SourceCollectorService,
          useValue: { collectTimeline },
        },
      ],
      useMockGuards: false,
    });
    moduleRef = await Test.createTestingModule({
      imports: [moduleConfig],
    }).compile();

    prisma = moduleRef.get(PrismaService);
    db = prisma as unknown as AttributionDatabase;
    dbHelper = createTestDatabaseHelper(moduleRef);
    analysisService = moduleRef.get(ListeningTopicAnalysisService);
    attributionService = moduleRef.get(ListeningTopicAttributionService);
    collectorService = moduleRef.get(ListeningTopicCollectorService);
    postAnalyticsService = moduleRef.get(PostAnalyticsService);
    sourcePostsService = moduleRef.get(SourcePostsService);
    topicsService = moduleRef.get(ListeningTopicsService);

    const logger = moduleRef.get(LoggerService);
    const contractService = new PostGroupContractService();
    const providerSetupService = new PublishingProviderSetupService(
      moduleRef.get(ConfigService),
    );
    const credentialReadinessService = new CredentialPublishingReadinessService(
      providerSetupService,
      moduleRef as unknown as ModuleRef,
      prisma,
    );
    const readinessService = new PostGroupReadinessService(
      credentialReadinessService,
    );
    const persistenceService = new PostGroupPersistenceService(
      prisma,
      contractService,
      readinessService,
    );
    postLifecycleService = new PostLifecycleService(
      prisma as never,
      logger as never,
    );
    const artifactReferenceService = new AgentArtifactReferenceService(
      prisma as never,
      logger as never,
    );
    publishApprovalsService = new PublishApprovalsService(
      prisma as never,
      artifactReferenceService,
      logger as never,
    );
    postGroupsService = new PostGroupsService(
      prisma,
      logger,
      { enqueue: enqueuePublish } as never,
      postLifecycleService,
      publishApprovalsService,
      persistenceService,
      contractService,
      readinessService,
    );
  });

  beforeEach(() => {
    collectTimeline.mockReset();
    publishOutbound.mockReset();
    enqueuePublish.mockClear();
  });

  afterAll(async () => {
    if (moduleRef) {
      await moduleRef.close();
    }
  });

  it('keeps evidence, release, publication, and measurement identities stable', async () => {
    const primary = await seedFixture('primary');
    const foreign = await seedFixture('foreign');
    const now = new Date();
    const previousStart = new Date(now.getTime() - 48 * 60 * 60 * 1000);
    const previousEnd = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const currentStart = previousEnd;
    const currentEnd = now;
    const collectedPosts = [
      makeCollectedPost(
        'provider-post-previous',
        new Date(now.getTime() - 36 * 60 * 60 * 1000),
      ),
      makeCollectedPost(
        'provider-post-current',
        new Date(now.getTime() - 12 * 60 * 60 * 1000),
      ),
    ];
    collectTimeline.mockImplementation(
      async (_platform: string, handle: string) => ({
        handle,
        platform: SocialSourcePlatform.TWITTER,
        posts: collectedPosts,
        provider: 'brand-oauth',
      }),
    );

    const primaryAnalysis = await collectAnalyzeAndReview(
      primary,
      previousStart,
      previousEnd,
      currentStart,
      currentEnd,
      true,
    );
    const foreignAnalysis = await collectAnalyzeAndReview(
      foreign,
      previousStart,
      previousEnd,
      currentStart,
      currentEnd,
      false,
    );

    expect(await db.sourcePost.count()).toBe(4);
    expect(await db.listeningEvidence.count()).toBe(4);
    expect(collectTimeline).toHaveBeenCalledTimes(3);

    const sourcePost = await db.sourcePost.findFirst({
      where: {
        brandId: primary.brandId,
        externalId: 'provider-post-current',
        isDeleted: false,
        organizationId: primary.organizationId,
      },
    });
    const evidence = await db.listeningEvidence.findFirst({
      where: {
        brandId: primary.brandId,
        isDeleted: false,
        organizationId: primary.organizationId,
        sourcePostId: sourcePost?.id,
        topicId: primaryAnalysis.topicId,
      },
    });
    if (!sourcePost || !evidence) {
      throw new Error('Expected collected source post and evidence');
    }
    const foreignEvidence = await db.listeningEvidence.findFirst({
      where: {
        brandId: foreign.brandId,
        isDeleted: false,
        organizationId: foreign.organizationId,
        topicId: foreignAnalysis.topicId,
      },
    });
    if (!foreignEvidence) {
      throw new Error('Expected foreign-tenant listening evidence');
    }

    const blockedInput = {
      actionType: SourcePostActionType.REPLY,
      listeningEvidenceIds: [evidence.id],
      listeningTopicId: primaryAnalysis.topicId,
    };
    await expect(
      sourcePostsService.createDraftFromPost(sourcePost.id, primary, {
        ...blockedInput,
        listeningThemeId: foreignAnalysis.themeId,
      }),
    ).rejects.toThrow('Listening attribution evidence is unavailable');
    await expect(
      sourcePostsService.createDraftFromPost(sourcePost.id, primary, {
        ...blockedInput,
        listeningEvidenceIds: [foreignEvidence.id],
        listeningThemeId: primaryAnalysis.themeId,
      }),
    ).rejects.toThrow('Listening attribution evidence is unavailable');
    await expect(
      sourcePostsService.createDraftFromPost(sourcePost.id, primary, {
        ...blockedInput,
        listeningEvidenceIds: [generateIdString()],
        listeningThemeId: primaryAnalysis.themeId,
      }),
    ).rejects.toThrow('Listening attribution evidence is unavailable');
    await expectNoDownstreamWrites();

    const attributionInput = {
      actionType: SourcePostActionType.REPLY,
      credentialId: primary.credentialId,
      listeningEvidenceIds: [evidence.id],
      listeningThemeId: primaryAnalysis.themeId,
      listeningTopicId: primaryAnalysis.topicId,
      text: 'A concise attributed response draft.',
    };
    const firstDelivery = await sourcePostsService.createDraftFromPost(
      sourcePost.id,
      primary,
      attributionInput,
    );
    const duplicateDelivery = await sourcePostsService.createDraftFromPost(
      sourcePost.id,
      primary,
      attributionInput,
    );

    expect(duplicateDelivery.draftId).toBe(firstDelivery.draftId);
    expect(await db.post.count()).toBe(1);
    await expectOutcome(primaryAnalysis, {
      actionId: firstDelivery.draftId,
      latestPostAnalyticsId: null,
      publicationId: null,
      releaseId: null,
      sourcePostId: sourcePost.id,
      state: 'draft',
    });

    const release = await postGroupsService.ensureReleaseForPost(
      primary.organizationId,
      primary.userId,
      firstDelivery.draftId,
    );
    await postGroupsService.scheduleTarget(
      primary.organizationId,
      primary.userId,
      release.id,
      firstDelivery.draftId,
      new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    );
    await expectOutcome(primaryAnalysis, {
      actionId: firstDelivery.draftId,
      releaseId: release.id,
      state: 'scheduled',
    });

    publishOutbound.mockResolvedValueOnce({
      externalId: 'provider-publication-1798',
      url: 'https://x.example.test/provider-publication-1798',
    });
    await postGroupsService.publishNow(
      primary.organizationId,
      primary.userId,
      release.id,
    );
    expect(enqueuePublish).toHaveBeenCalledTimes(1);
    const queued = enqueuePublish.mock.calls[0]?.[0] as {
      approvalId: string;
      operationId: string;
      organizationId: string;
      postId: string;
      versionPinId: string;
    };
    // The scheduled-post workflow marks a fresh approval queued inside its claim
    // action before leasing it. Mirror that order here — enqueue no longer
    // transitions the approval on the caller's thread.
    await publishApprovalsService.markQueued(
      queued.approvalId,
      queued.organizationId,
      primary.userId,
    );
    const claim = await publishApprovalsService.claimForExecution(queued);
    if (!claim.executionStartedAt) {
      throw new Error('Expected a fresh publish execution claim');
    }
    await postLifecycleService.transition({
      actorId: primary.userId,
      groupId: release.id,
      nextState: TargetExecutionState.PUBLISHING,
      organizationId: primary.organizationId,
      postId: firstDelivery.draftId,
      reason: 'Listening attribution integration publish started',
    });
    const providerResult = await publishOutbound({
      postId: firstDelivery.draftId,
    });
    const publishedAt = new Date();
    await postLifecycleService.transition({
      actorId: primary.userId,
      groupId: release.id,
      mutation: {
        externalId: providerResult.externalId,
        publishedAt,
        url: providerResult.url,
      },
      nextState: TargetExecutionState.PUBLISHED,
      organizationId: primary.organizationId,
      postId: firstDelivery.draftId,
      reason: 'Listening attribution integration publish completed',
      visibility: PostVisibility.PUBLIC,
    });
    await publishApprovalsService.completeExecution({
      approvalId: queued.approvalId,
      executionStartedAt: claim.executionStartedAt,
      isSuccessful: true,
      operationId: queued.operationId,
      organizationId: queued.organizationId,
      versionPinId: queued.versionPinId,
    });
    await expectOutcome(primaryAnalysis, {
      actionId: firstDelivery.draftId,
      publicationId: providerResult.externalId,
      releaseId: release.id,
      state: 'published',
    });

    const analytics = await postAnalyticsService.updateTodayAnalytics(
      firstDelivery.draftId,
      toPrismaCredentialPlatform(CredentialPlatform.TWITTER) as never,
      {
        totalComments: 4,
        totalLikes: 20,
        totalShares: 3,
        totalViews: 400,
      },
    );
    if (!analytics) {
      throw new Error('Expected canonical PostAnalytics ingestion');
    }
    const measured = await expectOutcome(primaryAnalysis, {
      actionId: firstDelivery.draftId,
      latestPostAnalyticsId: analytics.id,
      publicationId: providerResult.externalId,
      releaseId: release.id,
      state: 'measured',
    });
    expect(measured).not.toHaveProperty('raw');
    expect(measured).not.toHaveProperty('metadata');
  });

  async function collectAnalyzeAndReview(
    fixture: Fixture,
    previousWindowStart: Date,
    previousWindowEnd: Date,
    currentWindowStart: Date,
    currentWindowEnd: Date,
    verifyDedupe: boolean,
  ): Promise<{
    brandId: string;
    organizationId: string;
    themeId: string;
    topicId: string;
  }> {
    const topic = await topicsService.createScoped(
      {
        freshnessHours: 72,
        keywords: ['ai'],
        label: `AI signal ${fixture.brandId}`,
        sourceIds: [fixture.sourceId],
      },
      fixture,
    );
    await collectorService.collectScoped(topic.id, { limit: 10 }, fixture);
    if (verifyDedupe) {
      await collectorService.collectScoped(topic.id, { limit: 10 }, fixture);
      expect(
        await db.sourcePost.count({
          where: {
            brandId: fixture.brandId,
            organizationId: fixture.organizationId,
          },
        }),
      ).toBe(2);
      expect(
        await db.listeningEvidence.count({
          where: {
            brandId: fixture.brandId,
            organizationId: fixture.organizationId,
            topicId: topic.id,
          },
        }),
      ).toBe(2);
    }
    const analysis = await analysisService.analyzeScoped(
      topic.id,
      {
        currentWindowEnd: currentWindowEnd.toISOString(),
        currentWindowStart: currentWindowStart.toISOString(),
        minimumEvidencePerWindow: 1,
        previousWindowEnd: previousWindowEnd.toISOString(),
        previousWindowStart: previousWindowStart.toISOString(),
      },
      fixture,
    );
    const theme = analysis.themes[0];
    if (!theme) {
      throw new Error('Expected deterministic listening theme');
    }
    await analysisService.reviewThemeScoped(
      topic.id,
      theme.id,
      { state: 'acknowledged' },
      fixture,
    );
    return {
      brandId: fixture.brandId,
      organizationId: fixture.organizationId,
      themeId: theme.id,
      topicId: topic.id,
    };
  }

  async function expectOutcome(
    attribution: {
      brandId: string;
      organizationId: string;
      themeId: string;
      topicId: string;
    },
    expected: Record<string, unknown>,
  ) {
    const outcomes = await attributionService.listOutcomesScoped(
      attribution.topicId,
      attribution.themeId,
      {
        brandId: attribution.brandId,
        organizationId: attribution.organizationId,
      },
    );
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]).toMatchObject(expected);
    return outcomes[0];
  }

  async function expectNoDownstreamWrites(): Promise<void> {
    expect(await db.post.count()).toBe(0);
    expect(await db.postGroup.count()).toBe(0);
    expect(await db.publishApproval.count()).toBe(0);
    expect(await db.postAnalytics.count()).toBe(0);
  }

  async function seedFixture(suffix: string): Promise<Fixture> {
    const fixture = {
      brandId: generateIdString(),
      credentialId: generateIdString(),
      organizationId: generateIdString(),
      sourceId: generateIdString(),
      userId: `legacyUser1798${suffix}`,
    };
    await dbHelper.seedCollection('organizations', [
      createTestOrganization({
        id: fixture.organizationId,
        label: `Listening ${suffix}`,
        slug: `listening-1798-${suffix}-${fixture.organizationId}`,
        userId: fixture.userId,
      }),
    ]);
    await dbHelper.seedCollection('brands', [
      createTestBrand({
        id: fixture.brandId,
        label: `Listening brand ${suffix}`,
        organizationId: fixture.organizationId,
        slug: `listening-brand-1798-${suffix}-${fixture.brandId}`,
        userId: fixture.userId,
      }),
    ]);
    await dbHelper.seedCollection('members', [
      createTestMember({
        id: generateIdString(),
        lastUsedBrandId: fixture.brandId,
        organizationId: fixture.organizationId,
        roleId: 'member',
        roleKey: 'member',
        userId: fixture.userId,
      }),
    ]);
    await dbHelper.seedCollection('credentials', [
      createTestCredential({
        accessToken: 'connected-access-token',
        accessTokenExpiry: new Date('2099-01-01T00:00:00.000Z'),
        accessTokenSecret: 'connected-access-secret',
        brandId: fixture.brandId,
        externalHandle: `@listening_${suffix}`,
        externalId: `listening-account-${suffix}`,
        grantedScopes: [],
        grantedScopesCapturedAt: null,
        id: fixture.credentialId,
        organizationId: fixture.organizationId,
        platform: toPrismaCredentialPlatform(CredentialPlatform.TWITTER),
        userId: fixture.userId,
      }),
    ]);
    await prisma.socialSource.create({
      data: {
        brandId: fixture.brandId,
        credentialId: fixture.credentialId,
        displayName: `Listening source ${suffix}`,
        externalId: `source-account-${suffix}`,
        handle: `listening_${suffix}`,
        id: fixture.sourceId,
        organizationId: fixture.organizationId,
        platform: ListeningSourcePlatform.TWITTER,
        sourceType: 'account',
        userId: fixture.userId,
      },
    });
    return fixture;
  }
});

function makeCollectedPost(id: string, createdAt: Date) {
  return {
    authorDisplayName: 'Listening operator',
    authorId: 'provider-author-1798',
    authorUsername: 'operator',
    contentType: 'tweet',
    contentUrl: `https://x.example.test/operator/status/${id}`,
    createdAt,
    id,
    metrics: { comments: 2, likes: 12, shares: 1, views: 200 },
    platform: SocialSourcePlatform.TWITTER,
    text: 'AI operators are turning listening signals into useful responses.',
  };
}
