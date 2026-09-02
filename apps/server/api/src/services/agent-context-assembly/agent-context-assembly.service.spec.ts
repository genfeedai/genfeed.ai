import { AgentContextAssemblyService } from '@api/services/agent-context-assembly/agent-context-assembly.service';
import type { AssembledBrandContext } from '@api/services/agent-context-assembly/interfaces/context-assembly.interface';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function createLogger() {
  return {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };
}

function createCacheService() {
  return {
    generateKey: vi.fn((...parts: string[]) => parts.join(':')),
    getOrSet: vi.fn((_key: string, factory: () => Promise<unknown>) =>
      factory(),
    ),
  };
}

function createCompleteBrand() {
  return {
    agentConfig: {
      defaultModel: 'anthropic/claude-sonnet-5',
      persona: 'Prefer decisive operator copy.',
      strategy: {
        contentTypes: ['launch-post'],
        frequency: 'weekly',
        goals: ['pipeline'],
        platforms: ['linkedin'],
      },
      voice: {
        audience: ['founders', 'operators'],
        doNotSoundLike: ['generic'],
        messagingPillars: ['clarity', 'proof'],
        sampleOutput: 'Ship the sharp version.',
        style: 'concise',
        tone: 'direct',
        values: ['speed', 'taste'],
      },
    },
    backgroundColor: '#f8fafc',
    description: 'An operator-first content OS.',
    fontFamily: 'Inter',
    id: 'brand-1',
    label: 'Acme',
    organizationId: 'org-1',
    primaryColor: '#ff5500',
    referenceImages: [
      {
        category: 'hero',
        label: 'Hero reference',
        url: 'https://cdn.example.com/hero.png',
      },
    ],
    secondaryColor: '#111827',
    text: 'Use short, grounded copy with explicit proof.',
  };
}

// Logo, banner and reference assets are Asset rows resolved through
// BrandsService — the Brand row itself has no logo/banner column.
function createBrandKitAssets() {
  return {
    banner: {
      id: 'asset-banner',
      role: 'banner',
      url: 'https://cdn.example.com/banners/asset-banner',
    },
    logo: {
      id: 'asset-logo',
      role: 'logo',
      url: 'https://cdn.example.com/logos/asset-logo',
    },
    references: [],
  };
}

describe('AgentContextAssemblyService', () => {
  let brandMemoryService: { getInsights: ReturnType<typeof vi.fn> };
  let brandsService: {
    findOne: ReturnType<typeof vi.fn>;
    resolveBrandKitAssets: ReturnType<typeof vi.fn>;
  };
  let cacheService: ReturnType<typeof createCacheService>;
  let contextsService: { enhancePrompt: ReturnType<typeof vi.fn> };
  let loggerService: ReturnType<typeof createLogger>;
  let organizationSettingsService: { findOne: ReturnType<typeof vi.fn> };
  let patternMatcherService: {
    getTopPatternsForBrand: ReturnType<typeof vi.fn>;
  };
  let prisma: { post: { findMany: ReturnType<typeof vi.fn> } };
  let service: AgentContextAssemblyService;

  beforeEach(() => {
    brandMemoryService = {
      getInsights: vi.fn().mockResolvedValue([]),
    };
    brandsService = {
      findOne: vi.fn().mockResolvedValue(createCompleteBrand()),
      resolveBrandKitAssets: vi.fn().mockResolvedValue(createBrandKitAssets()),
    };
    cacheService = createCacheService();
    contextsService = {
      enhancePrompt: vi.fn().mockResolvedValue({ context: [] }),
    };
    loggerService = createLogger();
    organizationSettingsService = {
      findOne: vi.fn().mockResolvedValue(null),
    };
    patternMatcherService = {
      getTopPatternsForBrand: vi.fn().mockResolvedValue([]),
    };
    prisma = {
      post: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    };

    service = new AgentContextAssemblyService(
      brandsService as never,
      brandMemoryService as never,
      contextsService as never,
      prisma as never,
      cacheService as never,
      loggerService as never,
      patternMatcherService as never,
      organizationSettingsService as never,
    );
  });

  it('assembles accepted brand kit fields into generation context', async () => {
    const context = await service.assembleContext({
      brandId: 'brand-1',
      layers: { brandMemory: false },
      organizationId: 'org-1',
      platform: 'linkedin',
    });

    expect(brandsService.findOne).toHaveBeenCalledWith({
      id: 'brand-1',
      isDeleted: false,
      organizationId: 'org-1',
    });
    expect(context).toMatchObject({
      brandDescription: 'An operator-first content OS.',
      brandId: 'brand-1',
      brandKitReadiness: {
        missingFields: [],
        score: 100,
        status: 'complete',
      },
      brandName: 'Acme',
      defaultModel: 'anthropic/claude-sonnet-5',
      promptGuidelines: 'Use short, grounded copy with explicit proof.',
      strategy: {
        contentTypes: ['launch-post'],
        frequency: 'weekly',
        goals: ['pipeline'],
        platforms: ['linkedin'],
      },
      visualIdentity: {
        backgroundColor: '#f8fafc',
        bannerUrl: 'https://cdn.example.com/banners/asset-banner',
        fontFamily: 'Inter',
        logoUrl: 'https://cdn.example.com/logos/asset-logo',
        primaryColor: '#ff5500',
        referenceImages: [
          {
            category: 'hero',
            label: 'Hero reference',
            url: 'https://cdn.example.com/hero.png',
          },
        ],
        secondaryColor: '#111827',
      },
      voice: {
        audience: 'founders, operators',
        messagingPillars: ['clarity', 'proof'],
        sampleOutput: 'Ship the sharp version.',
        style: 'concise',
        tone: 'direct',
        values: ['speed', 'taste'],
      },
    });
  });

  it('registers the cached brand context under the org-scoped tag', async () => {
    await service.assembleContext({
      brandId: 'brand-1',
      layers: { brandMemory: false },
      organizationId: 'org-1',
      platform: 'linkedin',
    });

    // Brand-kit writes invalidate `brand-ctx:{orgId}` via invalidateByTags, so
    // every brand-ctx entry must carry the tag at set time — otherwise a fresh
    // logo import would wait out the TTL before reaching prompts.
    expect(cacheService.getOrSet).toHaveBeenCalledWith(
      'brand-ctx:org-1:brand-1',
      expect.any(Function),
      expect.objectContaining({ tags: ['brand-ctx:org-1'] }),
    );
  });

  it('puts brand kit values into the generated system prompt', async () => {
    const context = (await service.assembleContext({
      brandId: 'brand-1',
      layers: { brandMemory: false },
      organizationId: 'org-1',
    })) as AssembledBrandContext;

    const prompt = service.buildSystemPrompt('Base prompt.', context);

    expect(prompt).toContain('## Brand Guidelines');
    expect(prompt).toContain('Use short, grounded copy with explicit proof.');
    expect(prompt).toContain('- Primary color: #ff5500');
    expect(prompt).toContain('- Secondary color: #111827');
    expect(prompt).toContain('- Background color: #f8fafc');
    expect(prompt).toContain('- Font: Inter');
    expect(prompt).toContain(
      '- Logo reference: https://cdn.example.com/logos/asset-logo',
    );
    expect(prompt).toContain(
      '- Banner reference: https://cdn.example.com/banners/asset-banner',
    );
    expect(prompt).toContain(
      '- hero references: Hero reference (https://cdn.example.com/hero.png)',
    );
    expect(prompt).toContain('- Tone: direct');
    expect(prompt).toContain('- Style: concise');
    expect(prompt).toContain('- Messaging pillars: clarity, proof');
    expect(prompt).toContain('Ship the sharp version.');
  });

  it('owns the single brand-memory insight section', () => {
    const context: AssembledBrandContext = {
      assembledAt: new Date('2026-08-07T00:00:00.000Z'),
      brandId: 'brand-1',
      brandName: 'Acme',
      layersUsed: ['brandIdentity', 'brandMemory'],
      memoryInsights: [
        {
          category: 'hook',
          confidence: 0.8,
          insight: 'Founder-led teardowns outperform generic tips.',
        },
      ],
    };

    const prompt = service.buildSystemPrompt('', context);

    expect(prompt).toContain('## Performance Insights');
    expect(prompt).toContain(
      '- [hook] Founder-led teardowns outperform generic tips.',
    );
  });

  it('resolves visual identity from brand assets, not from the brand row', async () => {
    const brandWithoutAssetColumns = createCompleteBrand();

    expect(brandWithoutAssetColumns).not.toHaveProperty('logo');
    expect(brandWithoutAssetColumns).not.toHaveProperty('banner');

    const context = (await service.assembleContext({
      brandId: 'brand-1',
      layers: { brandMemory: false },
      organizationId: 'org-1',
    })) as AssembledBrandContext;

    expect(brandsService.resolveBrandKitAssets).toHaveBeenCalledWith(
      'brand-1',
      'org-1',
    );
    expect(context.visualIdentity?.logoUrl).toBe(
      'https://cdn.example.com/logos/asset-logo',
    );
    expect(service.buildSystemPrompt('Base prompt.', context)).toContain(
      '## Visual Identity',
    );
  });

  it('merges asset references with the legacy reference images column', async () => {
    brandsService.resolveBrandKitAssets.mockResolvedValue({
      references: [
        {
          id: 'asset-ref',
          label: 'Imported reference',
          role: 'reference',
          url: 'https://cdn.example.com/references/asset-ref',
        },
      ],
    });

    const context = await service.assembleContext({
      brandId: 'brand-1',
      layers: { brandMemory: false },
      organizationId: 'org-1',
    });

    expect(context?.visualIdentity?.referenceImages).toEqual([
      {
        category: 'hero',
        label: 'Hero reference',
        url: 'https://cdn.example.com/hero.png',
      },
      {
        category: 'reference',
        label: 'Imported reference',
        url: 'https://cdn.example.com/references/asset-ref',
      },
    ]);
  });

  it('reports partial readiness without hiding non-color visual fields', async () => {
    brandsService.resolveBrandKitAssets.mockResolvedValue({ references: [] });
    brandsService.findOne.mockResolvedValue({
      agentConfig: {},
      fontFamily: 'Inter',
      id: 'brand-partial',
      label: 'Partial',
      organizationId: 'org-1',
      primaryColor: '#000000',
      referenceImages: [],
    });

    const context = await service.assembleContext({
      brandId: 'brand-partial',
      layers: { brandMemory: false },
      organizationId: 'org-1',
    });

    expect(context?.brandKitReadiness).toMatchObject({
      missingFields: expect.arrayContaining([
        'description',
        'primaryColor',
        'promptGuidelines',
        'voiceTone',
        'voiceStyle',
        'logo',
        'references',
      ]),
      status: 'partial',
    });
    expect(context?.visualIdentity).toEqual({
      fontFamily: 'Inter',
    });
  });
});
