import { PostDraftGenerationService } from '@api/collections/posts/services/post-draft-generation.service';

vi.mock('@api/collections/templates/services/templates.service', () => ({
  TemplatesService: class {},
}));

import { ApiKeysService } from '@api/collections/api-keys/services/api-keys.service';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { MembersService } from '@api/collections/members/services/members.service';
import { HookPlatform } from '@api/collections/posts/dto/generate-hooks.dto';
import { TweetTone } from '@api/collections/posts/dto/generate-tweets.dto';
import type { PostDocument } from '@api/collections/posts/post.schema';
import { PostAccountGenerationService } from '@api/collections/posts/services/post-account-generation.service';
import { PostGenerationService } from '@api/collections/posts/services/post-generation.service';
import { PostThreadGenerationService } from '@api/collections/posts/services/post-thread-generation.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { TemplatesService } from '@api/collections/templates/services/templates.service';
import { DEFAULT_MINI_TEXT_MODEL } from '@api/constants/default-mini-text-model.constant';
import { TEXT_GENERATION_LIMITS } from '@api/constants/text-generation-limits.constant';
import { ReplicateService } from '@api/services/integrations/replicate/services/replicate.service';
import { PromptBuilderService } from '@api/services/prompt-builder/prompt-builder.service';
import { CredentialPlatform, SystemPromptKey } from '@genfeedai/contracts';
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
  const mockPostDraftGenerationService = { generateDraftText: vi.fn() };
  const mockPostAccountGenerationService = {
    retry: vi.fn(),
    start: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    mockBrandsService.findOne.mockResolvedValue({
      id: brandId,
      label: 'Test Brand',
    });
    mockMembersService.findOne.mockResolvedValue(null);

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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PostGenerationService,
        {
          provide: PostDraftGenerationService,
          useValue: mockPostDraftGenerationService,
        },
        { provide: ApiKeysService, useValue: mockApiKeysService },
        { provide: BrandsService, useValue: mockBrandsService },
        { provide: LoggerService, useValue: mockLoggerService },
        { provide: MembersService, useValue: mockMembersService },
        {
          provide: PostThreadGenerationService,
          useValue: mockPostThreadGenerationService,
        },
        {
          provide: PostAccountGenerationService,
          useValue: mockPostAccountGenerationService,
        },
        { provide: PostsService, useValue: mockPostsService },
        { provide: PromptBuilderService, useValue: mockPromptBuilderService },
        { provide: ReplicateService, useValue: mockReplicateService },
        { provide: TemplatesService, useValue: mockTemplatesService },
      ],
    }).compile();

    service = module.get<PostGenerationService>(PostGenerationService);
  });

  it('delegates draft generation with the unchanged caller identity and deferred key resolver', async () => {
    const dto = {
      brandId,
      prompt: 'Launch',
      platform: CredentialPlatform.TWITTER,
      requestKey: '7b1f6a3e-2c54-4d0e-9a8b-3f1c2d4e5a60',
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
    ).toHaveBeenCalledWith(dto, identity, resolver, undefined);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('account generation', () => {
    const dto = {
      count: 3,
      credentialId,
      format: 'post' as const,
      tone: TweetTone.PROFESSIONAL,
      topic: 'AI technology',
    };

    it('starts a receipt-backed run with the unchanged caller identity', async () => {
      mockPostAccountGenerationService.start.mockResolvedValueOnce([mockPost]);

      await expect(
        service.startAccountContentGeneration(dto, identity),
      ).resolves.toEqual([mockPost]);
      expect(mockPostAccountGenerationService.start).toHaveBeenCalledWith(
        dto,
        identity,
      );
    });

    it('retries a failed placeholder under the caller-supplied request key', async () => {
      mockPostAccountGenerationService.retry.mockResolvedValueOnce(mockPost);

      await expect(
        service.retryAccountContentGeneration(postId, 'key-1', identity),
      ).resolves.toBe(mockPost);
      expect(mockPostAccountGenerationService.retry).toHaveBeenCalledWith(
        postId,
        'key-1',
        identity,
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
