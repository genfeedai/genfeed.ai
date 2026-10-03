import { PostDraftGenerationService } from '@api/collections/posts/services/post-draft-generation.service';

vi.mock('@api/collections/templates/services/templates.service', () => ({
  TemplatesService: class {},
}));

import { ApiKeysService } from '@api/collections/api-keys/services/api-keys.service';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { LearningDecisionService } from '@api/collections/content-learning/services/learning-decision.service';
import { AccountPublishingContextService } from '@api/collections/credentials/services/account-publishing-context.service';
import { MembersService } from '@api/collections/members/services/members.service';
import { HookPlatform } from '@api/collections/posts/dto/generate-hooks.dto';
import { TweetTone } from '@api/collections/posts/dto/generate-tweets.dto';
import type { PostDocument } from '@api/collections/posts/post.schema';
import { PostAccountLearningService } from '@api/collections/posts/services/post-account-learning.service';
import { PostGenerationService } from '@api/collections/posts/services/post-generation.service';
import { PostThreadGenerationService } from '@api/collections/posts/services/post-thread-generation.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { TemplatesService } from '@api/collections/templates/services/templates.service';
import { TrendReferenceCorpusService } from '@api/collections/trends/services/trend-reference-corpus.service';
import { DEFAULT_MINI_TEXT_MODEL } from '@api/constants/default-mini-text-model.constant';
import { TEXT_GENERATION_LIMITS } from '@api/constants/text-generation-limits.constant';
import { ActivityRecorderService } from '@api/services/activity-recording/activity-recorder.service';
import { ReplicateService } from '@api/services/integrations/replicate/services/replicate.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { PromptBuilderService } from '@api/services/prompt-builder/prompt-builder.service';
import {
  ContentLearningArm,
  ContentLearningMode,
  CredentialPlatform,
  Status,
  SystemPromptKey,
  TargetExecutionState,
} from '@genfeedai/contracts';
import { learningGenerationReceiptSchema } from '@genfeedai/contracts/api-types/contracts/content-learning-generation.contract';
import type { AccountPublishingContext } from '@genfeedai/contracts/interfaces';
import { testId } from '@helpers/testing/test-id.helper';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

describe('PostGenerationService', () => {
  let service: PostGenerationService;

  const userId = testId('user');
  const organizationId = testId('org');
  const brandId = testId('brand');
  const postId = testId('post');
  const credentialId = testId('credential');
  const activityId = testId('activity');
  const sourceReferenceId = testId('sourceref');
  const trendId = testId('trend');
  const secondPostId = testId('post', 2);
  const childPostId1 = testId('childpost', 1);
  const childPostId2 = testId('childpost', 2);

  const identity = {
    brandId,
    id: userId,
    organizationId,
    userId,
  };

  // PostsService is fully mocked here, so this only ever stands in for a
  // service return value — the suite reads `id` and `description` and nothing
  // else. Narrowed to the fields under test rather than fabricating the whole
  // ~80-field PostDocument shape, matching how other API specs mock it.
  const mockPost = {
    id: postId,
    brandId,
    credentialId,
    description: 'Test post description',
    organizationId,
    platform: CredentialPlatform.TWITTER,
    userId,
  } as unknown as PostDocument;

  const mockPublishingContext = {
    account: {
      handle: 'testaccount',
      id: credentialId,
      label: 'Twitter Account',
      platform: CredentialPlatform.TWITTER,
    },
    brand: { id: brandId, label: 'Test Brand' },
    constraints: {
      maxWeightedCharacters: 280,
      notes: ['Standard X posts use the 280 weighted-character limit.'],
      supportsDirectPublishing: true,
      supportsRichArticleCopy: false,
      supportsThreads: true,
      usesWeightedCharacters: true,
    },
    promptHints: ['Account: Twitter Account', 'Platform: twitter'],
    publishability: 'publishable',
    readiness: {
      appReviewStatus: 'unknown',
      callbackUrlStatus: 'unknown',
      canSchedule: true,
      diagnostics: [],
      isRetryable: false,
      permissionScopeStatus: 'unknown',
      providerKey: CredentialPlatform.TWITTER,
      quotaStatus: 'unknown',
      state: 'publish_capable',
      tokenFreshness: 'pass',
    },
    recentPosts: [],
    surface: 'post',
  } satisfies AccountPublishingContext;

  const mockActivity = { id: activityId };

  const mockActivitiesService = {
    record: vi.fn().mockResolvedValue(mockActivity),
    update: vi.fn().mockResolvedValue(mockActivity),
  };
  const mockAccountPublishingContextService = {
    resolveDraft: vi.fn(),
    resolve: vi.fn().mockResolvedValue(mockPublishingContext),
  };

  const mockApiKeysService = {
    findOne: vi.fn(),
  };
  const mockBrandsService = {
    findOne: vi.fn().mockResolvedValue({ id: brandId, label: 'Test Brand' }),
  };
  const mockMembersService = {
    findOne: vi.fn().mockResolvedValue(null),
  };
  const mockLoggerService = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };
  const mockPostsService = {
    create: vi.fn().mockResolvedValue(mockPost),
    patch: vi.fn().mockResolvedValue(mockPost),
  };
  const mockPostThreadGenerationService = {
    expandThread: vi.fn().mockResolvedValue(undefined),
  };
  const mockPromptBuilderService = {
    buildPrompt: vi.fn().mockResolvedValue({
      input: { max_tokens: 4096, prompt: 'test prompt' },
    }),
  };
  const mockReplicateService = {
    generateTextCompletionSync: vi.fn().mockResolvedValue(
      `Tweet 1: This is a great tweet about technology.
Tweet 2: Here's another insightful post.
Tweet 3: Tech innovation is changing the world.`,
    ),
  };
  const mockTemplatesService = {
    getRenderedPrompt: vi.fn().mockResolvedValue('Generated prompt template'),
  };
  const mockTrendReferenceCorpusService = {
    recordPostRemixLineage: vi.fn().mockResolvedValue(undefined),
  };
  const mockWebsocketService = {
    emit: vi.fn().mockResolvedValue(undefined),
  };

  const mockPostDraftGenerationService = { generateDraftText: vi.fn() };
  const mockLearningDecisionService = {
    resolveBatchForGeneration: vi.fn(),
    bindArtifact: vi.fn(),
  };
  function learningResolution(index: number, reason: string) {
    return {
      receipt: {
        decisionId: `decision-${index}`,
        credentialId,
        mode: ContentLearningMode.SHADOW,
        accountRevision: 1,
        epoch: 1,
        armId: ContentLearningArm.BASELINE,
        probabilities: {
          [ContentLearningArm.BASELINE]: 1,
          [ContentLearningArm.QUESTION_EXAMPLE]: 0,
          [ContentLearningArm.PROOF_STEPS]: 0,
        },
        selectedProbability: 1,
        assignment: 'control' as const,
        assignmentProbability: 1,
        executionProbability: 1,
        configVersion: 'rl-reward-v1-experimental',
        synthetic: false,
        reason,
      },
      contribution: {},
    };
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    mockAccountPublishingContextService.resolveDraft.mockResolvedValue({
      brand: mockPublishingContext.brand,
      constraints: { ...mockPublishingContext.constraints },
    });
    mockBrandsService.findOne.mockResolvedValue({
      id: brandId,
      label: 'Test Brand',
    });
    mockMembersService.findOne.mockResolvedValue(null);

    mockActivitiesService.record.mockResolvedValue(mockActivity);
    mockActivitiesService.update.mockResolvedValue(mockActivity);
    mockAccountPublishingContextService.resolve.mockResolvedValue(
      mockPublishingContext,
    );
    mockPostsService.create.mockResolvedValue(mockPost);
    mockPostsService.patch.mockResolvedValue(mockPost);
    mockPostThreadGenerationService.expandThread.mockResolvedValue(undefined);
    mockPromptBuilderService.buildPrompt.mockResolvedValue({
      input: { max_tokens: 4096, prompt: 'test prompt' },
    });
    mockReplicateService.generateTextCompletionSync.mockResolvedValue(
      `Tweet 1: This is a great tweet about technology.
Tweet 2: Here's another insightful post.
Tweet 3: Tech innovation is changing the world.`,
    );
    mockTemplatesService.getRenderedPrompt.mockResolvedValue(
      'Generated prompt template',
    );
    mockTrendReferenceCorpusService.recordPostRemixLineage.mockResolvedValue(
      undefined,
    );
    mockWebsocketService.emit.mockResolvedValue(undefined);
    mockLearningDecisionService.resolveBatchForGeneration.mockImplementation(
      ({ candidates }: { candidates: unknown[] }) =>
        candidates.map((_, index) =>
          learningResolution(index, 'insufficient_baseline'),
        ),
    );
    mockLearningDecisionService.bindArtifact.mockResolvedValue('hash');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PostGenerationService,
        PostAccountLearningService,
        {
          provide: LearningDecisionService,
          useValue: mockLearningDecisionService,
        },
        {
          provide: PostDraftGenerationService,
          useValue: mockPostDraftGenerationService,
        },
        {
          provide: AccountPublishingContextService,
          useValue: mockAccountPublishingContextService,
        },
        { provide: ActivityRecorderService, useValue: mockActivitiesService },
        { provide: ApiKeysService, useValue: mockApiKeysService },
        { provide: BrandsService, useValue: mockBrandsService },
        { provide: LoggerService, useValue: mockLoggerService },
        { provide: MembersService, useValue: mockMembersService },
        {
          provide: PostThreadGenerationService,
          useValue: mockPostThreadGenerationService,
        },
        { provide: PostsService, useValue: mockPostsService },
        { provide: PromptBuilderService, useValue: mockPromptBuilderService },
        { provide: ReplicateService, useValue: mockReplicateService },
        { provide: TemplatesService, useValue: mockTemplatesService },
        {
          provide: TrendReferenceCorpusService,
          useValue: mockTrendReferenceCorpusService,
        },
        {
          provide: NotificationsPublisherService,
          useValue: mockWebsocketService,
        },
      ],
    }).compile();

    service = module.get<PostGenerationService>(PostGenerationService);
  });

  it('delegates draft generation with the unchanged caller identity and deferred key resolver', async () => {
    const dto = {
      brandId,
      prompt: 'Launch',
      platform: CredentialPlatform.TWITTER,
    };
    const resolver = vi.fn();
    const result = { description: 'Draft', model: DEFAULT_MINI_TEXT_MODEL };
    mockPostDraftGenerationService.generateDraftText.mockResolvedValueOnce(
      result,
    );
    await expect(
      service.generateDraftText(dto, identity, resolver),
    ).resolves.toBe(result);
    expect(
      mockPostDraftGenerationService.generateDraftText,
    ).toHaveBeenCalledWith(dto, identity, resolver);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('startAccountContentGeneration', () => {
    const dto = {
      count: 3,
      credentialId,
      format: 'post' as const,
      tone: TweetTone.PROFESSIONAL,
      topic: 'AI technology',
    };

    it('resolves context, creates a post per requested item, and returns them', async () => {
      vi.spyOn(service, 'generateAccountContentAsync').mockResolvedValueOnce(
        undefined,
      );

      const result = await service.startAccountContentGeneration(dto, identity);

      expect(mockAccountPublishingContextService.resolve).toHaveBeenCalledWith(
        expect.objectContaining({
          brandId,
          credentialId,
          organizationId,
          surface: 'post',
        }),
      );
      expect(mockPostsService.create).toHaveBeenCalledTimes(3);
      expect(mockPostsService.create).toHaveBeenCalledWith(
        expect.objectContaining({ platform: CredentialPlatform.TWITTER }),
      );
      expect(result).toHaveLength(3);
    });

    it('uses the resolved account platform when creating drafts', async () => {
      mockAccountPublishingContextService.resolve.mockResolvedValueOnce({
        ...mockPublishingContext,
        account: {
          ...mockPublishingContext.account,
          platform: CredentialPlatform.LINKEDIN,
        },
      });

      await service.startAccountContentGeneration(dto, identity);

      expect(mockPostsService.create).toHaveBeenCalledWith(
        expect.objectContaining({ platform: CredentialPlatform.LINKEDIN }),
      );
    });
  });

  describe('generateAccountContentAsync', () => {
    it('records remix lineage for generated tweet posts when source metadata is provided', async () => {
      await service.generateAccountContentAsync(
        {
          count: 3,
          credentialId,
          format: 'post',
          sourceReferenceIds: [sourceReferenceId],
          sourceUrl: 'https://x.com/example/status/1',
          topic: 'AI technology',
          trendId,
        },
        [mockPost],
        identity,
        mockPublishingContext,
      );

      expect(
        mockTrendReferenceCorpusService.recordPostRemixLineage,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          brandId,
          draftType: 'tweet',
          organizationId,
          platforms: [CredentialPlatform.TWITTER],
          postId,
        }),
      );
    });

    it('records remix lineage for generated thread posts when source metadata is provided', async () => {
      await service.generateAccountContentAsync(
        {
          count: 5,
          credentialId,
          format: 'thread',
          sourceReferenceIds: [sourceReferenceId],
          sourceUrl: 'https://x.com/example/status/1',
          topic: 'AI technology',
          trendId,
        },
        [mockPost],
        identity,
        mockPublishingContext,
      );

      expect(
        mockTrendReferenceCorpusService.recordPostRemixLineage,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          brandId,
          draftType: 'thread',
          organizationId,
          platforms: [CredentialPlatform.TWITTER],
          postId,
        }),
      );
    });

    it('marks posts FAILED and patches the activity when generation throws', async () => {
      mockReplicateService.generateTextCompletionSync.mockResolvedValue('');

      await service.generateAccountContentAsync(
        { count: 1, credentialId, format: 'post', topic: 'AI' },
        [mockPost],
        identity,
        mockPublishingContext,
      );

      expect(mockActivitiesService.update).toHaveBeenCalled();
      expect(mockWebsocketService.emit).toHaveBeenCalled();
    });

    it('still marks posts FAILED when the activity cleanup patch itself throws', async () => {
      mockReplicateService.generateTextCompletionSync.mockResolvedValue('');
      // The failure-cleanup path marks the activity FAILED; that write itself
      // throwing must NOT short-circuit cleanup and leave placeholder posts
      // stuck in PROCESSING (issue #861).
      mockActivitiesService.update.mockRejectedValueOnce(
        new Error('activity store down'),
      );

      await service.generateAccountContentAsync(
        { count: 1, credentialId, format: 'post', topic: 'AI' },
        [mockPost],
        identity,
        mockPublishingContext,
      );

      expect(mockActivitiesService.update).toHaveBeenCalled();
      expect(mockPostsService.patch).toHaveBeenCalledWith(
        String(mockPost.id),
        expect.objectContaining({
          targetExecutionState: TargetExecutionState.FAILED,
        }),
      );
    });

    it('marks every created post FAILED when activity creation throws (issue #861)', async () => {
      mockActivitiesService.record.mockRejectedValueOnce(
        new Error('activity store down'),
      );
      const secondPost = { ...mockPost, id: secondPostId };

      await service.generateAccountContentAsync(
        { count: 2, credentialId, format: 'post', topic: 'AI' },
        [mockPost, secondPost],
        identity,
        mockPublishingContext,
      );

      // No activity exists, so the failure branch must not attempt to patch it.
      expect(mockActivitiesService.update).not.toHaveBeenCalled();
      // Both placeholder posts are driven out of PROCESSING into FAILED.
      expect(mockPostsService.patch).toHaveBeenCalledWith(
        String(mockPost.id),
        expect.objectContaining({
          targetExecutionState: TargetExecutionState.FAILED,
        }),
      );
      expect(mockPostsService.patch).toHaveBeenCalledWith(
        String(secondPost.id),
        expect.objectContaining({
          targetExecutionState: TargetExecutionState.FAILED,
        }),
      );
    });
  });

  describe('account generation learning', () => {
    const groupedPosts = [
      { ...mockPost, groupId: 'group' },
      { ...mockPost, id: secondPostId, groupId: 'group' },
    ] as unknown as PostDocument[];
    const dto = {
      count: 2,
      credentialId,
      format: 'post' as const,
      topic: 'AI technology',
    };
    it('resolves learning before the first provider call with one candidate per draft', async () => {
      await service.generateAccountContentAsync(
        dto,
        groupedPosts,
        identity,
        mockPublishingContext,
      );
      expect(
        mockLearningDecisionService.resolveBatchForGeneration,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          originalPrompt: 'AI technology',
          format: 'text',
          context: expect.objectContaining({ requestKey: 'group' }),
          candidates: [
            { candidateIndex: 0, generationId: postId },
            { candidateIndex: 1, generationId: secondPostId },
          ],
        }),
      );
      expect(
        mockLearningDecisionService.resolveBatchForGeneration.mock
          .invocationCallOrder[0],
      ).toBeLessThan(
        mockReplicateService.generateTextCompletionSync.mock
          .invocationCallOrder[0],
      );
      expect(mockLearningDecisionService.bindArtifact).toHaveBeenCalledWith(
        organizationId,
        'decision-0',
        postId,
      );
      expect(mockLearningDecisionService.bindArtifact).toHaveBeenCalledWith(
        organizationId,
        'decision-1',
        secondPostId,
      );
    });
    it('emits a schema-valid learning receipt with the completed draft', async () => {
      await service.generateAccountContentAsync(
        dto,
        groupedPosts,
        identity,
        mockPublishingContext,
      );
      const completed = mockWebsocketService.emit.mock.calls
        .map(([, payload]) => payload)
        .filter((payload) => payload.status === Status.COMPLETED);
      expect(completed).toHaveLength(2);
      for (const payload of completed) {
        expect(
          learningGenerationReceiptSchema.safeParse(payload.learningReceipt)
            .success,
        ).toBe(true);
        expect(payload.learningReceipt.application.status).toBe('baseline');
      }
    });
    it('revalidates replay-only before X repair attempts 2 and 3 only', async () => {
      mockReplicateService.generateTextCompletionSync.mockResolvedValue(
        'x'.repeat(400),
      );
      await service.generateAccountContentAsync(
        { ...dto, count: 1 },
        [groupedPosts[0]],
        identity,
        mockPublishingContext,
      );
      const calls =
        mockLearningDecisionService.resolveBatchForGeneration.mock.calls;
      expect(calls).toHaveLength(3);
      expect(calls[0][0].replayOnly).toBeUndefined();
      expect(calls[1][0].replayOnly).toBe(true);
      expect(calls[2][0].replayOnly).toBe(true);
      const order =
        mockLearningDecisionService.resolveBatchForGeneration.mock
          .invocationCallOrder;
      const providerOrder =
        mockReplicateService.generateTextCompletionSync.mock
          .invocationCallOrder;
      expect(providerOrder).toHaveLength(3);
      expect(order[1]).toBeGreaterThan(providerOrder[0]);
      expect(order[1]).toBeLessThan(providerOrder[1]);
      expect(order[2]).toBeLessThan(providerOrder[2]);
    });
    it('builds byte-identical prompts whatever the learning outcome', async () => {
      const runs: unknown[][] = [];
      for (const outcome of ['baseline', 'paused', 'throw']) {
        vi.clearAllMocks();
        mockPromptBuilderService.buildPrompt.mockResolvedValue({
          input: { max_tokens: 4096, prompt: 'test prompt' },
        });
        mockTemplatesService.getRenderedPrompt.mockResolvedValue(
          'Generated prompt template',
        );
        if (outcome === 'throw')
          mockLearningDecisionService.resolveBatchForGeneration.mockRejectedValue(
            new Error('learning down'),
          );
        else
          mockLearningDecisionService.resolveBatchForGeneration.mockImplementation(
            ({ candidates }: { candidates: unknown[] }) =>
              candidates.map((_, index) =>
                learningResolution(
                  index,
                  outcome === 'paused' ? 'paused' : 'insufficient_baseline',
                ),
              ),
          );
        await service.generateAccountContentAsync(
          dto,
          groupedPosts,
          identity,
          mockPublishingContext,
        );
        runs.push(mockPromptBuilderService.buildPrompt.mock.calls);
      }
      expect(runs[1]).toEqual(runs[0]);
      expect(runs[2]).toEqual(runs[0]);
      const prompt = JSON.stringify(runs[0]);
      for (const marker of [
        'baseline-v1',
        'question-example',
        'proof-steps',
        'learning',
      ])
        expect(prompt).not.toContain(marker);
    });
    it('still completes every draft when learning is unavailable', async () => {
      mockLearningDecisionService.resolveBatchForGeneration.mockRejectedValue(
        new Error('learning down'),
      );
      mockLearningDecisionService.bindArtifact.mockRejectedValue(
        new Error('binding down'),
      );
      await service.generateAccountContentAsync(
        dto,
        groupedPosts,
        identity,
        mockPublishingContext,
      );
      const completed = mockWebsocketService.emit.mock.calls
        .map(([, payload]) => payload)
        .filter((payload) => payload.status === Status.COMPLETED);
      expect(completed).toHaveLength(2);
      expect(completed[0].learningReceipt.application.status).toBe(
        'unavailable',
      );
      expect(mockLearningDecisionService.bindArtifact).not.toHaveBeenCalled();
      expect(mockPostsService.patch).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          targetExecutionState: TargetExecutionState.FAILED,
        }),
      );
    });
  });

  describe('expandThreadAsync', () => {
    const originalPost = { ...mockPost, description: 'Original tweet content' };
    const childPosts = [
      { ...mockPost, id: childPostId1 },
      { ...mockPost, id: childPostId2 },
    ];

    it('delegates thread generation through the bounded service', async () => {
      const dto = { count: 3, tone: TweetTone.PROFESSIONAL };
      await service.expandThreadAsync(originalPost, childPosts, dto, identity);

      expect(mockPostThreadGenerationService.expandThread).toHaveBeenCalledWith(
        originalPost,
        childPosts,
        dto,
        identity,
        undefined,
      );
    });

    // #5375: BYOK — the key captured synchronously by the controller before
    // this fire-and-forget dispatch must reach the bounded thread service.
    it('forwards a resolved BYOK key to the bounded service', async () => {
      const dto = { count: 3, tone: TweetTone.PROFESSIONAL };
      await service.expandThreadAsync(
        originalPost,
        childPosts,
        dto,
        identity,
        'org-openrouter-key',
      );

      expect(mockPostThreadGenerationService.expandThread).toHaveBeenCalledWith(
        originalPost,
        childPosts,
        dto,
        identity,
        'org-openrouter-key',
      );
    });
  });

  describe('parseTweetContent', () => {
    it('uses X weighted character counting for emoji and URLs', () => {
      const weightedValidPost = `${'a'.repeat(
        250,
      )} https://example.com/${'b'.repeat(220)} 😄`;
      const weightedInvalidPost = `${'a'.repeat(279)} 😄`;

      expect(weightedValidPost.length).toBeGreaterThan(280);
      expect(
        service.parseTweetContent(
          JSON.stringify([weightedValidPost]),
          1,
          mockPublishingContext,
        ),
      ).toEqual([weightedValidPost]);
      expect(
        service.parseTweetContent(
          JSON.stringify([weightedInvalidPost]),
          1,
          mockPublishingContext,
        ),
      ).toEqual([]);
    });

    it('parses a JSON array of posts and respects maxCount', () => {
      const content = JSON.stringify(['First post', 'Second post', 'Third']);

      expect(service.parseTweetContent(content, 2)).toEqual([
        'First post',
        'Second post',
      ]);
    });
  });

  describe('extractLabelFromTweet', () => {
    it('returns short text unchanged and truncates long text at a word boundary', () => {
      expect(service.extractLabelFromTweet('Short label')).toBe('Short label');

      const long = `${'word '.repeat(20)}`.trim();
      const label = service.extractLabelFromTweet(long, 20);

      expect(label.endsWith('...')).toBe(true);
      expect(label.length).toBeLessThanOrEqual(23);
    });

    it('returns an empty string for blank input', () => {
      expect(service.extractLabelFromTweet('   ')).toBe('');
    });
  });

  describe('enhanceDescription', () => {
    it('builds the prompt and returns the AI completion', async () => {
      mockReplicateService.generateTextCompletionSync.mockResolvedValueOnce(
        'Enhanced description',
      );

      const result = await service.enhanceDescription(
        mockPost,
        { prompt: 'Make it more engaging', tone: TweetTone.PROFESSIONAL },
        identity,
      );

      expect(mockTemplatesService.getRenderedPrompt).toHaveBeenCalled();
      expect(mockPromptBuilderService.buildPrompt).toHaveBeenCalled();
      expect(result).toBe('Enhanced description');
    });

    it('defaults the tone to professional when not specified', async () => {
      await service.enhanceDescription(
        mockPost,
        { prompt: 'Improve' },
        identity,
      );

      expect(mockTemplatesService.getRenderedPrompt).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ tone: 'professional' }),
        organizationId,
      );
    });

    // #5375: BYOK — the resolved org key must reach the actual dispatch.
    it('forwards a resolved BYOK key to the completion call', async () => {
      await service.enhanceDescription(
        mockPost,
        { prompt: 'Improve' },
        identity,
        'org-openrouter-key',
      );

      expect(
        mockReplicateService.generateTextCompletionSync,
      ).toHaveBeenCalledWith(
        DEFAULT_MINI_TEXT_MODEL,
        expect.any(Object),
        'org-openrouter-key',
      );
    });

    it('dispatches with no key override when the guard did not bypass', async () => {
      await service.enhanceDescription(
        mockPost,
        { prompt: 'Improve' },
        identity,
      );

      expect(
        mockReplicateService.generateTextCompletionSync,
      ).toHaveBeenCalledWith(
        DEFAULT_MINI_TEXT_MODEL,
        expect.any(Object),
        undefined,
      );
    });
  });

  describe('generateHookVariations', () => {
    it('parses a JSON array of hooks and returns metadata', async () => {
      mockReplicateService.generateTextCompletionSync.mockResolvedValueOnce(
        '["Hook one", "Hook two", "Hook three"]',
      );

      const result = await service.generateHookVariations(
        {
          count: 3,
          platform: HookPlatform.TWITTER,
          topic: 'AI technology',
        },
        identity,
      );

      expect(result.hooks).toEqual(['Hook one', 'Hook two', 'Hook three']);
      expect(result.metadata.platform).toBe('twitter');
      expect(result.metadata.topic).toBe('AI technology');
      expect(result.metadata.count).toBe(3);
    });

    it('builds the Replicate input via the prompt builder with org context and the hook system prompt (issue #861)', async () => {
      mockReplicateService.generateTextCompletionSync.mockResolvedValueOnce(
        '[]',
      );

      await service.generateHookVariations(
        { count: 2, platform: HookPlatform.TWITTER, topic: 'AI' },
        identity,
      );

      expect(mockPromptBuilderService.buildPrompt).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          maxTokens: TEXT_GENERATION_LIMITS.hookGeneration,
          systemPromptTemplate: SystemPromptKey.HOOK_GENERATOR,
          useTemplate: false,
        }),
        organizationId,
      );
      // The typed input object is forwarded to Replicate (no raw-string call).
      expect(
        mockReplicateService.generateTextCompletionSync,
      ).toHaveBeenCalledWith(
        expect.any(String),
        {
          max_tokens: 4096,
          prompt: 'test prompt',
        },
        undefined,
      );
    });

    // #5375: the guard-resolved BYOK key travels on identity via the
    // controller and must reach the actual provider dispatch.
    it('forwards a resolved BYOK key to the completion call', async () => {
      mockReplicateService.generateTextCompletionSync.mockResolvedValueOnce(
        '[]',
      );

      await service.generateHookVariations(
        { count: 2, platform: HookPlatform.TWITTER, topic: 'AI' },
        identity,
        'org-openrouter-key',
      );

      expect(
        mockReplicateService.generateTextCompletionSync,
      ).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        'org-openrouter-key',
      );
    });

    describe('brand resolution (#5292 — no "any brand in this org" fallback for API keys)', () => {
      function stubValidBrands(validBrandIds: readonly string[]): void {
        mockBrandsService.findOne.mockImplementation(
          async (query: { id?: unknown; organizationId?: unknown }) => {
            if (
              typeof query.id === 'string' &&
              validBrandIds.includes(query.id) &&
              query.organizationId === organizationId
            ) {
              return { id: query.id, label: 'Test Brand' };
            }
            return null;
          },
        );
      }

      beforeEach(() => {
        mockReplicateService.generateTextCompletionSync.mockResolvedValue('[]');
      });

      it('resolves an API-key caller\'s brand from the key\'s validated defaultBrandId, never the ambient "any org brand" convenience', async () => {
        stubValidBrands(['key-default-brand']);
        const apiKeyIdentity = {
          ...identity,
          apiKeyId: 'apikey-1',
          brandId: 'any-org-brand-ambient-fallback',
          id: userId,
          isApiKey: true,
        };

        mockApiKeysService.findOne.mockResolvedValue({
          defaultBrandId: 'key-default-brand',
        });

        await service.generateHookVariations(
          { count: 2, platform: HookPlatform.TWITTER, topic: 'AI' },
          apiKeyIdentity,
        );

        expect(mockApiKeysService.findOne).toHaveBeenCalledWith({
          id: 'apikey-1',
        });
        expect(mockBrandsService.findOne).toHaveBeenCalledWith({
          id: 'key-default-brand',
          organizationId,
        });
      });

      it("falls back to the key owner's member currentBrandId when the key has no valid default brand", async () => {
        stubValidBrands(['owner-current-brand']);
        const apiKeyIdentity = {
          ...identity,
          apiKeyId: 'apikey-1',
          brandId: 'any-org-brand-ambient-fallback',
          id: userId,
          isApiKey: true,
        };

        mockApiKeysService.findOne.mockResolvedValue({ defaultBrandId: null });
        mockMembersService.findOne.mockResolvedValue({
          currentBrandId: 'owner-current-brand',
        });

        await service.generateHookVariations(
          { count: 2, platform: HookPlatform.TWITTER, topic: 'AI' },
          apiKeyIdentity,
        );

        expect(mockMembersService.findOne).toHaveBeenCalledWith({
          organizationId,
          userId,
        });
        expect(mockBrandsService.findOne).toHaveBeenCalledWith({
          id: 'owner-current-brand',
          organizationId,
        });
      });

      it('rejects an API-key caller whose key has no valid default brand and whose owner has no current brand — never widens to "any brand in the org"', async () => {
        stubValidBrands([]);
        const apiKeyIdentity = {
          ...identity,
          apiKeyId: 'apikey-1',
          brandId: 'any-org-brand-ambient-fallback',
          id: userId,
          isApiKey: true,
        };

        mockApiKeysService.findOne.mockResolvedValue({ defaultBrandId: null });
        mockMembersService.findOne.mockResolvedValue(null);

        await expect(
          service.generateHookVariations(
            { count: 2, platform: HookPlatform.TWITTER, topic: 'AI' },
            apiKeyIdentity,
          ),
        ).rejects.toThrow(
          'brandId is required to generate hook variations. Configure a default brand for this API key, or pass brandId explicitly.',
        );
      });
    });
  });
});
