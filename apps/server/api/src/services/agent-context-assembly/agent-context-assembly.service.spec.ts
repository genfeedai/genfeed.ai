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
    _id: 'brand-1',
    agentConfig: {
      defaultModel: 'anthropic/claude-sonnet-4-5-20250929',
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
    banner: 'https://cdn.example.com/banner.png',
    description: 'An operator-first content OS.',
    fontFamily: 'Inter',
    id: 'brand-1',
    label: 'Acme',
    logo: 'https://cdn.example.com/logo.png',
    organization: 'org-1',
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

describe('AgentContextAssemblyService', () => {
  let brandMemoryService: { getInsights: ReturnType<typeof vi.fn> };
  let brandsService: { findOne: ReturnType<typeof vi.fn> };
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
      _id: 'brand-1',
      isDeleted: false,
      organization: 'org-1',
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
      defaultModel: 'anthropic/claude-sonnet-4-5-20250929',
      promptGuidelines: 'Use short, grounded copy with explicit proof.',
      strategy: {
        contentTypes: ['launch-post'],
        frequency: 'weekly',
        goals: ['pipeline'],
        platforms: ['linkedin'],
      },
      visualIdentity: {
        backgroundColor: '#f8fafc',
        bannerUrl: 'https://cdn.example.com/banner.png',
        fontFamily: 'Inter',
        logoUrl: 'https://cdn.example.com/logo.png',
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
      '- Logo reference: https://cdn.example.com/logo.png',
    );
    expect(prompt).toContain(
      '- Banner reference: https://cdn.example.com/banner.png',
    );
    expect(prompt).toContain(
      '- hero references: Hero reference (https://cdn.example.com/hero.png)',
    );
    expect(prompt).toContain('- Tone: direct');
    expect(prompt).toContain('- Style: concise');
    expect(prompt).toContain('- Messaging pillars: clarity, proof');
    expect(prompt).toContain('Ship the sharp version.');
  });

  it('reports partial readiness without hiding non-color visual fields', async () => {
    brandsService.findOne.mockResolvedValue({
      _id: 'brand-partial',
      agentConfig: {},
      fontFamily: 'Inter',
      id: 'brand-partial',
      label: 'Partial',
      organization: 'org-1',
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
