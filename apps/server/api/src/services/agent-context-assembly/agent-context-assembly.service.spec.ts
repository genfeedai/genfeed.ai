import { BrandMemoryService } from '@api/collections/brand-memory/services/brand-memory.service';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { ContextsService } from '@api/collections/contexts/services/contexts.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { AgentContextAssemblyService } from '@api/services/agent-context-assembly/agent-context-assembly.service';
import { CacheService } from '@api/services/cache/services/cache.service';
import { PatternMatcherService } from '@api/services/pattern-matcher/pattern-matcher.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Types } from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('AgentContextAssemblyService', () => {
  let service: AgentContextAssemblyService;

  const orgId = new Types.ObjectId().toString();
  const brandId = new Types.ObjectId().toString();

  const mockBrand = {
    _id: new Types.ObjectId(brandId),
    agentConfig: {
      defaultModel: 'anthropic/claude-3.5-sonnet',
      persona: 'Be concise and technical',
      platformOverrides: {
        linkedin: {
          defaultModel: 'openai/gpt-4o',
          persona: 'Sound more executive and polished',
          strategy: {
            contentTypes: ['thought_leadership'],
            frequency: 'weekly',
            goals: ['pipeline'],
            platforms: ['linkedin'],
          },
          voice: {
            audience: ['operators'],
            doNotSoundLike: ['corporate buzzwords'],
            messagingPillars: ['proof'],
            sampleOutput: 'A concise operator memo.',
            style: 'executive',
            tone: 'insightful',
            values: ['clarity'],
          },
        },
      },
      strategy: {
        contentTypes: ['thread', 'carousel'],
        frequency: 'daily',
        goals: ['grow audience', 'drive traffic'],
        platforms: ['twitter', 'linkedin'],
      },
      voice: {
        approvedHooks: ['Open with a sharp operator insight.'],
        audience: ['developers', 'founders'],
        bannedPhrases: ['game-changing AI'],
        canonicalSource: 'founder',
        doNotSoundLike: ['corporate jargon', 'broetry'],
        exemplarTexts: ['We ship systems, not vibes.'],
        hashtags: ['#genfeed'],
        messagingPillars: ['clarity', 'systems thinking'],
        sampleOutput: 'Clear systems create compounding output.',
        style: 'conversational',
        taglines: ['Create content that compounds'],
        tone: 'professional',
        values: ['innovation', 'simplicity'],
        writingRules: [
          'Lead with a concrete claim.',
          'Avoid fluffy adjectives.',
        ],
      },
    },
    description: 'A cutting-edge AI company',
    label: 'TestBrand',
  };

  const mockInsights = [
    { category: 'timing', confidence: 0.85, insight: 'Evenings perform best' },
    {
      category: 'format',
      confidence: 0.72,
      insight: 'Threads get 2x engagement',
    },
  ];

  const mockRagResult = {
    context: [
      { content: 'AI trends in 2026', relevance: 0.9, source: 'blog' },
      { content: 'Product launch notes', relevance: 0.7, source: 'docs' },
    ],
  };

  const mockBrandsService = {
    findOne: vi.fn(),
  };

  const mockBrandMemoryService = {
    getInsights: vi.fn(),
  };

  const mockContextsService = {
    enhancePrompt: vi.fn(),
  };

  const mockPostModel = {
    find: vi.fn(),
  };

  const mockCacheService = {
    generateKey: vi.fn((...parts: string[]) => parts.join(':')),
    getOrSet: vi.fn((_key: string, factory: () => Promise<unknown>) =>
      factory(),
    ),
  };

  const mockLogger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  const mockPatternMatcherService = {
    getTopPatternsForBrand: vi.fn().mockResolvedValue([]),
  };

  const mockOrganizationSettingsService = {
    findOne: vi.fn().mockResolvedValue(null),
  };

  const mockCredentialsService = {
    findOne: vi.fn().mockResolvedValue(null),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    service = new AgentContextAssemblyService(
      mockBrandsService as unknown as BrandsService,
      mockBrandMemoryService as unknown as BrandMemoryService,
      mockContextsService as unknown as ContextsService,
      mockPostModel as never,
      mockCacheService as unknown as CacheService,
      mockLogger as unknown as LoggerService,
      mockPatternMatcherService as unknown as PatternMatcherService,
      mockOrganizationSettingsService as unknown as OrganizationSettingsService,
      mockCredentialsService as unknown as CredentialsService,
    );
  });

  describe('assembleContext', () => {
    it('should return null when no brand is selected', async () => {
      mockBrandsService.findOne.mockResolvedValue(null);

      const result = await service.assembleContext({
        organizationId: orgId,
      });

      expect(result).toBeNull();
    });

    it('should assemble identity + voice from brand agentConfig', async () => {
      mockBrandsService.findOne.mockResolvedValue(mockBrand);
      mockBrandMemoryService.getInsights.mockResolvedValue([]);

      const result = await service.assembleContext({
        organizationId: orgId,
      });

      expect(result).not.toBeNull();
      expect(result!.brandName).toBe('TestBrand');
      expect(result!.brandDescription).toBe('A cutting-edge AI company');
      expect(result!.defaultModel).toBe('anthropic/claude-3.5-sonnet');
      expect(result!.persona).toBe('Be concise and technical');
      expect(result!.voice?.tone).toBe('professional');
      expect(result!.voice?.style).toBe('conversational');
      expect(result!.voice?.canonicalSource).toBe('founder');
      expect(result!.voice?.doNotSoundLike).toEqual([
        'corporate jargon',
        'broetry',
      ]);
      expect(result!.voice?.approvedHooks).toEqual([
        'Open with a sharp operator insight.',
      ]);
      expect(result!.voice?.bannedPhrases).toEqual(['game-changing AI']);
      expect(result!.voice?.exemplarTexts).toEqual([
        'We ship systems, not vibes.',
      ]);
      expect(result!.voice?.hashtags).toEqual(['#genfeed']);
      expect(result!.voice?.messagingPillars).toEqual([
        'clarity',
        'systems thinking',
      ]);
      expect(result!.voice?.sampleOutput).toBe(
        'Clear systems create compounding output.',
      );
      expect(result!.voice?.taglines).toEqual([
        'Create content that compounds',
      ]);
      expect(result!.voice?.writingRules).toEqual([
        'Lead with a concrete claim.',
        'Avoid fluffy adjectives.',
      ]);
      expect(result!.layersUsed).toContain('brandGuidance');
      expect(result!.layersUsed).toContain('brandIdentity');
    });

    it('should load memory insights when brandMemory layer enabled', async () => {
      mockBrandsService.findOne.mockResolvedValue(mockBrand);
      mockBrandMemoryService.getInsights.mockResolvedValue(mockInsights);

      const result = await service.assembleContext({
        layers: { brandMemory: true },
        organizationId: orgId,
      });

      expect(result!.memoryInsights).toHaveLength(2);
      expect(result!.memoryInsights![0].category).toBe('timing');
      expect(result!.layersUsed).toContain('brandMemory');
    });

    it('should skip RAG when no query provided', async () => {
      mockBrandsService.findOne.mockResolvedValue(mockBrand);
      mockBrandMemoryService.getInsights.mockResolvedValue([]);

      await service.assembleContext({
        layers: { ragContext: true },
        organizationId: orgId,
      });

      expect(mockContextsService.enhancePrompt).not.toHaveBeenCalled();
    });

    it('should load RAG context when query is provided', async () => {
      mockBrandsService.findOne.mockResolvedValue(mockBrand);
      mockBrandMemoryService.getInsights.mockResolvedValue([]);
      mockContextsService.enhancePrompt.mockResolvedValue(mockRagResult);

      const result = await service.assembleContext({
        layers: { ragContext: true },
        organizationId: orgId,
        query: 'AI trends',
      });

      expect(result!.ragEntries).toHaveLength(2);
      expect(result!.layersUsed).toContain('ragContext');
      expect(mockContextsService.enhancePrompt).toHaveBeenCalledWith(
        expect.objectContaining({ prompt: 'AI trends' }),
        orgId,
      );
    });

    it('should load recent post summaries when recentPosts layer enabled', async () => {
      mockBrandsService.findOne.mockResolvedValue(mockBrand);
      mockBrandMemoryService.getInsights.mockResolvedValue([]);

      const mockPosts = [
        {
          createdAt: new Date(),
          description: 'Check out our latest AI feature launch!',
          platform: 'twitter',
        },
        {
          createdAt: new Date(),
          description: 'Deep dive into transformer architecture',
          platform: 'linkedin',
        },
      ];

      const mockChain = {
        exec: vi.fn().mockResolvedValue(mockPosts),
        lean: vi.fn(),
        limit: vi.fn(),
        select: vi.fn(),
        sort: vi.fn(),
      };
      mockChain.sort.mockReturnValue(mockChain);
      mockChain.limit.mockReturnValue(mockChain);
      mockChain.select.mockReturnValue(mockChain);
      mockChain.lean.mockReturnValue(mockChain);
      mockPostModel.find.mockReturnValue(mockChain);

      const result = await service.assembleContext({
        layers: { recentPosts: true },
        organizationId: orgId,
      });

      expect(result!.recentPostSummaries).toHaveLength(2);
      expect(result!.recentPostSummaries![0]).toContain('[twitter]');
      expect(result!.layersUsed).toContain('recentPosts');
    });

    it('should respect layer toggles (disabled layers not fetched)', async () => {
      mockBrandsService.findOne.mockResolvedValue(mockBrand);

      await service.assembleContext({
        layers: {
          brandGuidance: false,
          brandIdentity: true,
          brandMemory: false,
          ragContext: false,
          recentPosts: false,
        },
        organizationId: orgId,
      });

      expect(mockBrandMemoryService.getInsights).not.toHaveBeenCalled();
      expect(mockContextsService.enhancePrompt).not.toHaveBeenCalled();
      expect(mockPostModel.find).not.toHaveBeenCalled();
    });

    it('should include strategy when available on brand', async () => {
      mockBrandsService.findOne.mockResolvedValue(mockBrand);
      mockBrandMemoryService.getInsights.mockResolvedValue([]);

      const result = await service.assembleContext({
        organizationId: orgId,
      });

      expect(result!.strategy).toBeDefined();
      expect(result!.strategy!.goals).toEqual([
        'grow audience',
        'drive traffic',
      ]);
      expect(result!.strategy!.platforms).toEqual(['twitter', 'linkedin']);
      expect(result!.layersUsed).toContain('brandGuidance');
    });

    it('should apply platform overrides on top of brand defaults', async () => {
      mockBrandsService.findOne.mockResolvedValue(mockBrand);
      mockBrandMemoryService.getInsights.mockResolvedValue([]);

      const result = await service.assembleContext({
        organizationId: orgId,
        platform: 'linkedin',
      });

      expect(result!.defaultModel).toBe('openai/gpt-4o');
      expect(result!.persona).toBe('Sound more executive and polished');
      expect(result!.voice?.tone).toBe('insightful');
      expect(result!.voice?.style).toBe('executive');
      expect(result!.voice?.messagingPillars).toEqual(['proof']);
      expect(result!.voice?.doNotSoundLike).toEqual(['corporate buzzwords']);
      expect(result!.voice?.sampleOutput).toBe('A concise operator memo.');
      expect(result!.strategy?.contentTypes).toEqual(['thought_leadership']);
      expect(result!.strategy?.platforms).toEqual(['linkedin']);
      expect(result!.layersUsed).toContain('platformOverride');
    });

    it('should fall back to organization default model when brand has none', async () => {
      mockBrandsService.findOne.mockResolvedValue({
        ...mockBrand,
        agentConfig: {
          ...mockBrand.agentConfig,
          defaultModel: undefined,
        },
      });
      mockBrandMemoryService.getInsights.mockResolvedValue([]);
      mockOrganizationSettingsService.findOne.mockResolvedValue({
        defaultModel: 'anthropic/claude-sonnet-4-5-20250929',
      });

      const result = await service.assembleContext({
        organizationId: orgId,
      });

      expect(result!.defaultModel).toBe('anthropic/claude-sonnet-4-5-20250929');
    });

    it('should include visual identity when brand has non-default colors', async () => {
      mockBrandsService.findOne.mockResolvedValue({
        ...mockBrand,
        fontFamily: 'Montserrat',
        primaryColor: '#FF5500',
        referenceImages: [],
        secondaryColor: '#001122',
      });
      mockBrandMemoryService.getInsights.mockResolvedValue([]);

      const result = await service.assembleContext({
        organizationId: orgId,
      });

      expect(result!.visualIdentity).toBeDefined();
      expect(result!.visualIdentity!.primaryColor).toBe('#FF5500');
      expect(result!.visualIdentity!.secondaryColor).toBe('#001122');
      expect(result!.visualIdentity!.fontFamily).toBe('Montserrat');
    });

    it('should include reference images in visual identity', async () => {
      mockBrandsService.findOne.mockResolvedValue({
        ...mockBrand,
        primaryColor: '#000000',
        referenceImages: [
          {
            category: 'brand',
            label: 'Logo shot',
            url: 'https://example.com/1.jpg',
          },
          {
            category: 'product',
            label: 'Hero',
            url: 'https://example.com/2.jpg',
          },
        ],
      });
      mockBrandMemoryService.getInsights.mockResolvedValue([]);

      const result = await service.assembleContext({
        organizationId: orgId,
      });

      expect(result!.visualIdentity).toBeDefined();
      expect(result!.visualIdentity!.referenceImages).toHaveLength(2);
      expect(result!.visualIdentity!.referenceImages![0].category).toBe(
        'brand',
      );
      expect(result!.visualIdentity!.referenceImages![0].label).toBe(
        'Logo shot',
      );
    });

    it('should not include visual identity when colors are default and no reference images', async () => {
      mockBrandsService.findOne.mockResolvedValue({
        ...mockBrand,
        primaryColor: '#000000',
        referenceImages: [],
      });
      mockBrandMemoryService.getInsights.mockResolvedValue([]);

      const result = await service.assembleContext({
        organizationId: orgId,
      });

      expect(result!.visualIdentity).toBeUndefined();
    });

    it('should handle layer fetch failures gracefully', async () => {
      mockBrandsService.findOne.mockResolvedValue(mockBrand);
      mockBrandMemoryService.getInsights.mockRejectedValue(
        new Error('Redis down'),
      );

      const result = await service.assembleContext({
        organizationId: orgId,
      });

      expect(result).not.toBeNull();
      expect(result!.brandName).toBe('TestBrand');
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('should use CacheService.getOrSet with correct keys', async () => {
      mockBrandsService.findOne.mockResolvedValue(mockBrand);
      mockBrandMemoryService.getInsights.mockResolvedValue([]);

      await service.assembleContext({
        organizationId: orgId,
      });

      expect(mockCacheService.getOrSet).toHaveBeenCalled();
      expect(mockCacheService.generateKey).toHaveBeenCalledWith(
        'brand-ctx',
        orgId,
        'selected',
      );
    });

    it('should use specific brandId when provided', async () => {
      mockBrandsService.findOne.mockResolvedValue(mockBrand);
      mockBrandMemoryService.getInsights.mockResolvedValue([]);

      await service.assembleContext({
        brandId,
        organizationId: orgId,
      });

      expect(mockCacheService.generateKey).toHaveBeenCalledWith(
        'brand-ctx',
        orgId,
        brandId,
      );
    });
  });

  describe('buildSystemPrompt', () => {
    it('should include all sections with correct headers', () => {
      const context = {
        assembledAt: new Date(),
        brandDescription: 'An AI company',
        brandId,
        brandName: 'TestBrand',
        layersUsed: [
          'brandIdentity',
          'brandGuidance',
          'brandMemory',
          'recentPosts',
        ],
        memoryInsights: [
          {
            category: 'timing',
            confidence: 0.85,
            insight: 'Post at 6pm',
          },
        ],
        recentPostSummaries: ['[twitter] Great AI launch!'],
        voice: {
          audience: 'developers',
          doNotSoundLike: ['corporate jargon'],
          hashtags: ['#genfeed'],
          messagingPillars: ['clarity', 'proof'],
          sampleOutput: 'Clear systems create compounding output.',
          style: 'casual',
          taglines: ['Code smarter'],
          tone: 'friendly',
          values: ['innovation'],
        },
      };

      const result = service.buildSystemPrompt('Base prompt', context);

      expect(result).toContain('Base prompt');
      expect(result).toContain('## Brand: TestBrand');
      expect(result).toContain('An AI company');
      expect(result).toContain('## Brand Voice');
      expect(result).toContain('- Tone: friendly');
      expect(result).toContain('- Style: casual');
      expect(result).toContain('- Target audience: developers');
      expect(result).toContain('- Messaging pillars: clarity, proof');
      expect(result).toContain('- Avoid sounding like: corporate jargon');
      expect(result).toContain('- Brand values: innovation');
      expect(result).toContain('- Taglines: Code smarter');
      expect(result).toContain('- Hashtags: #genfeed');
      expect(result).toContain('## Voice Example');
      expect(result).toContain('Clear systems create compounding output.');
      expect(result).toContain('## Performance Insights');
      expect(result).toContain('Post at 6pm');
      expect(result).toContain('## Recent Posts');
      expect(result).toContain('[twitter] Great AI launch!');
    });

    it('should include persona as Custom Instructions', () => {
      const context = {
        assembledAt: new Date(),
        brandId,
        brandName: 'TestBrand',
        layersUsed: ['brandIdentity'],
        persona: 'Always respond in bullet points',
      };

      const result = service.buildSystemPrompt('', context);

      expect(result).toContain('## Custom Instructions');
      expect(result).toContain('Always respond in bullet points');
    });

    it('should inject reply style instructions with no-emoji policy', () => {
      const context = {
        assembledAt: new Date(),
        brandId,
        brandName: 'TestBrand',
        layersUsed: ['brandIdentity'],
      };

      const result = service.buildSystemPrompt('Base prompt', context, {
        replyStyle: 'friendly',
      });

      expect(result).toContain('## Reply Style');
      expect(result).toContain('No emoji.');
    });

    it('should include strategy section when present', () => {
      const context = {
        assembledAt: new Date(),
        brandId,
        brandName: 'TestBrand',
        layersUsed: ['brandIdentity', 'strategy'],
        strategy: {
          contentTypes: ['thread', 'carousel'],
          frequency: 'daily',
          goals: ['grow', 'engage'],
          platforms: ['twitter'],
        },
      };

      const result = service.buildSystemPrompt('', context);

      expect(result).toContain('## Content Strategy');
      expect(result).toContain('Goals: grow, engage');
      expect(result).toContain('Content types: thread, carousel');
      expect(result).toContain('Platforms: twitter');
      expect(result).toContain('Frequency: daily');
    });

    it('should include RAG entries with source labels', () => {
      const context = {
        assembledAt: new Date(),
        brandId,
        brandName: 'TestBrand',
        layersUsed: ['brandIdentity', 'ragContext'],
        ragEntries: [
          { content: 'Latest AI trends', relevance: 0.9, source: 'blog' },
        ],
      };

      const result = service.buildSystemPrompt('', context);

      expect(result).toContain('## Relevant Knowledge');
      expect(result).toContain('[blog]: Latest AI trends');
    });

    it('should include visual identity section when present', () => {
      const context = {
        assembledAt: new Date(),
        brandId,
        brandName: 'TestBrand',
        layersUsed: ['brandIdentity'],
        visualIdentity: {
          fontFamily: 'Montserrat',
          primaryColor: '#FF5500',
          referenceImages: [
            { category: 'brand', label: 'Logo shot' },
            { category: 'brand', label: 'Banner' },
            { category: 'product', label: 'Hero image' },
          ],
          secondaryColor: '#001122',
        },
      };

      const result = service.buildSystemPrompt('', context);

      expect(result).toContain('## Visual Identity');
      expect(result).toContain('- Primary color: #FF5500');
      expect(result).toContain('- Secondary color: #001122');
      expect(result).toContain('- Font: Montserrat');
      expect(result).toContain('brand references: Logo shot, Banner');
      expect(result).toContain('product references: Hero image');
    });

    it('should work with empty base prompt', () => {
      const context = {
        assembledAt: new Date(),
        brandId,
        brandName: 'TestBrand',
        layersUsed: ['brandIdentity'],
      };

      const result = service.buildSystemPrompt('', context);

      expect(result).toContain('## Brand: TestBrand');
    });
  });
});
