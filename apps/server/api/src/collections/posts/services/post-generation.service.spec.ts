vi.mock('@api/collections/templates/services/templates.service', () => ({
  TemplatesService: class {},
}));

import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import { AccountPublishingContextService } from '@api/collections/credentials/services/account-publishing-context.service';
import { TweetTone } from '@api/collections/posts/dto/generate-tweets.dto';
import type { PostDocument } from '@api/collections/posts/post.schema';
import { PostGenerationService } from '@api/collections/posts/services/post-generation.service';
import { PostThreadGenerationService } from '@api/collections/posts/services/post-thread-generation.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { TemplatesService } from '@api/collections/templates/services/templates.service';
import { TrendReferenceCorpusService } from '@api/collections/trends/services/trend-reference-corpus.service';
import { TEXT_GENERATION_LIMITS } from '@api/constants/text-generation-limits.constant';
import { ReplicateService } from '@api/services/integrations/replicate/services/replicate.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { PromptBuilderService } from '@api/services/prompt-builder/prompt-builder.service';
import {
  CredentialPlatform,
  SystemPromptKey,
  TargetExecutionState,
} from '@genfeedai/contracts';
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
    create: vi.fn().mockResolvedValue(mockActivity),
    patch: vi.fn().mockResolvedValue(mockActivity),
  };
  const mockAccountPublishingContextService = {
    resolve: vi.fn().mockResolvedValue(mockPublishingContext),
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

  beforeEach(async () => {
    vi.clearAllMocks();

    mockActivitiesService.create.mockResolvedValue(mockActivity);
    mockActivitiesService.patch.mockResolvedValue(mockActivity);
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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PostGenerationService,
        {
          provide: AccountPublishingContextService,
          useValue: mockAccountPublishingContextService,
        },
        { provide: ActivitiesService, useValue: mockActivitiesService },
        { provide: LoggerService, useValue: mockLoggerService },
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

      expect(mockActivitiesService.patch).toHaveBeenCalled();
      expect(mockWebsocketService.emit).toHaveBeenCalled();
    });

    it('still marks posts FAILED when the activity cleanup patch itself throws', async () => {
      mockReplicateService.generateTextCompletionSync.mockResolvedValue('');
      // The failure-cleanup path marks the activity FAILED; that write itself
      // throwing must NOT short-circuit cleanup and leave placeholder posts
      // stuck in PROCESSING (issue #861).
      mockActivitiesService.patch.mockRejectedValueOnce(
        new Error('activity store down'),
      );

      await service.generateAccountContentAsync(
        { count: 1, credentialId, format: 'post', topic: 'AI' },
        [mockPost],
        identity,
        mockPublishingContext,
      );

      expect(mockActivitiesService.patch).toHaveBeenCalled();
      expect(mockPostsService.patch).toHaveBeenCalledWith(
        String(mockPost.id),
        expect.objectContaining({
          targetExecutionState: TargetExecutionState.FAILED,
        }),
      );
    });

    it('marks every created post FAILED when activity creation throws (issue #861)', async () => {
      mockActivitiesService.create.mockRejectedValueOnce(
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
      expect(mockActivitiesService.patch).not.toHaveBeenCalled();
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
  });

  describe('generateHookVariations', () => {
    it('parses a JSON array of hooks and returns metadata', async () => {
      mockReplicateService.generateTextCompletionSync.mockResolvedValueOnce(
        '["Hook one", "Hook two", "Hook three"]',
      );

      const result = await service.generateHookVariations(
        {
          count: 3,
          platform: 'twitter',
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
        { count: 2, platform: 'twitter', topic: 'AI' },
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
      ).toHaveBeenCalledWith(expect.any(String), {
        max_tokens: 4096,
        prompt: 'test prompt',
      });
    });
  });
});
