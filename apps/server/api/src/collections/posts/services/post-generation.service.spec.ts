vi.mock('@api/collections/templates/services/templates.service', () => ({
  TemplatesService: class {},
}));

import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import { AccountPublishingContextService } from '@api/collections/credentials/services/account-publishing-context.service';
import { TweetTone } from '@api/collections/posts/dto/generate-tweets.dto';
import { PostGenerationService } from '@api/collections/posts/services/post-generation.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { TemplatesService } from '@api/collections/templates/services/templates.service';
import { TrendReferenceCorpusService } from '@api/collections/trends/services/trend-reference-corpus.service';
import { ReplicateService } from '@api/services/integrations/replicate/replicate.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { PromptBuilderService } from '@api/services/prompt-builder/prompt-builder.service';
import { CredentialPlatform } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

describe('PostGenerationService', () => {
  let service: PostGenerationService;

  const userId = '507f1f77bcf86cd799439011';
  const organizationId = '507f1f77bcf86cd799439012';
  const brandId = '507f1f77bcf86cd799439013';
  const postId = '507f1f77bcf86cd799439014';
  const credentialId = '507f1f77bcf86cd799439016';

  const publicMetadata = {
    brand: brandId,
    organization: organizationId,
    user: userId,
  };

  const mockPost = {
    _id: postId,
    brand: brandId,
    credential: credentialId,
    description: 'Test post description',
    organization: organizationId,
    platform: CredentialPlatform.TWITTER,
  };

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
    recentPosts: [],
    surface: 'post',
  };

  const mockActivity = { _id: '507f191e810c19729de860ee' };

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
    recordDraftRemixLineage: vi.fn().mockResolvedValue(undefined),
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
    mockTrendReferenceCorpusService.recordDraftRemixLineage.mockResolvedValue(
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
      credential: credentialId,
      format: 'post' as const,
      tone: TweetTone.PROFESSIONAL,
      topic: 'AI technology',
    };

    it('resolves context, creates a post per requested item, and returns them', async () => {
      vi.spyOn(service, 'generateAccountContentAsync').mockResolvedValueOnce(
        undefined,
      );

      const result = await service.startAccountContentGeneration(
        dto,
        publicMetadata,
      );

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

      await service.startAccountContentGeneration(dto, publicMetadata);

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
          credential: credentialId,
          format: 'post',
          sourceReferenceIds: ['507f1f77bcf86cd799439099'],
          sourceUrl: 'https://x.com/example/status/1',
          topic: 'AI technology',
          trendId: '507f1f77bcf86cd799439098',
        },
        [mockPost],
        publicMetadata,
        mockPublishingContext,
      );

      expect(
        mockTrendReferenceCorpusService.recordDraftRemixLineage,
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
          credential: credentialId,
          format: 'thread',
          sourceReferenceIds: ['507f1f77bcf86cd799439099'],
          sourceUrl: 'https://x.com/example/status/1',
          topic: 'AI technology',
          trendId: '507f1f77bcf86cd799439098',
        },
        [mockPost],
        publicMetadata,
        mockPublishingContext,
      );

      expect(
        mockTrendReferenceCorpusService.recordDraftRemixLineage,
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
        { count: 1, credential: credentialId, format: 'post', topic: 'AI' },
        [mockPost],
        publicMetadata,
        mockPublishingContext,
      );

      expect(mockActivitiesService.patch).toHaveBeenCalled();
      expect(mockWebsocketService.emit).toHaveBeenCalled();
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
        publicMetadata,
      );

      expect(mockTemplatesService.getRenderedPrompt).toHaveBeenCalled();
      expect(mockPromptBuilderService.buildPrompt).toHaveBeenCalled();
      expect(result).toBe('Enhanced description');
    });

    it('defaults the tone to professional when not specified', async () => {
      await service.enhanceDescription(
        mockPost,
        { prompt: 'Improve' },
        publicMetadata,
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

      const result = await service.generateHookVariations({
        count: 3,
        platform: 'twitter',
        topic: 'AI technology',
      });

      expect(result.hooks).toEqual(['Hook one', 'Hook two', 'Hook three']);
      expect(result.metadata.platform).toBe('twitter');
      expect(result.metadata.topic).toBe('AI technology');
      expect(result.metadata.count).toBe(3);
    });
  });
});
