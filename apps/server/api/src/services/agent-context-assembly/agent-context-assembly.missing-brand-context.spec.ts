import { AgentContextAssemblyService } from '@api/services/agent-context-assembly/agent-context-assembly.service';
import type { AssembleContextParams } from '@api/services/agent-context-assembly/interfaces/context-assembly.interface';
import { MISSING_BRAND_CONTEXT_HEADER } from '@api/services/agent-orchestrator/constants/missing-brand-context.constant';
import { brandAccessFixture } from '@api/shared/testing/brand-access.fixture';
import { describe, expect, it, vi } from 'vitest';

/** Every card field filled except Offer, with a scanned offer suggestion. */
function createBrand(agentConfig: Record<string, unknown> = {}) {
  return {
    agentConfig: {
      signupPrefill: {
        status: 'completed',
        suggestions: { audiences: [], competitors: [], offers: ['Coaching'] },
      },
      strategy: {
        competitors: ['Rival'],
        frequency: 'weekly',
        goals: ['Drive sales'],
        platforms: ['linkedin'],
      },
      voice: { audience: ['Founders'], tone: 'direct' },
      ...agentConfig,
    },
    id: 'brand-1',
    label: 'Acme',
    organizationId: 'org-1',
  };
}

function createService(brand = createBrand()) {
  return new AgentContextAssemblyService(
    {
      brandAccessService: brandAccessFixture(),
      findOne: vi.fn().mockResolvedValue(brand),
      resolveBrandKitAssets: vi
        .fn()
        .mockResolvedValue({ banner: null, logo: null, references: [] }),
    } as never,
    { getInsights: vi.fn().mockResolvedValue([]) } as never,
    {
      retrieveBrandContentMemory: vi.fn().mockResolvedValue([]),
      retrieveBrandKnowledge: vi.fn().mockResolvedValue([]),
      retrieveOrgAndPersonalContentMemory: vi.fn().mockResolvedValue([]),
    } as never,
    {
      findOne: vi.fn().mockResolvedValue({ currentBrandId: 'brand-1' }),
    } as never,
    { post: { findMany: vi.fn().mockResolvedValue([]) } } as never,
    {
      generateKey: (...parts: string[]) => parts.join(':'),
      getOrSet: (_key: string, factory: () => Promise<unknown>) => factory(),
    } as never,
    { debug: vi.fn(), error: vi.fn(), log: vi.fn(), warn: vi.fn() } as never,
    { getTopPatternsForBrand: vi.fn().mockResolvedValue([]) } as never,
    { findOne: vi.fn().mockResolvedValue(null) } as never,
    undefined as never,
  );
}

const PARAMS: AssembleContextParams = {
  brandId: 'brand-1',
  layers: { missingBrandContext: true },
  organizationId: 'org-1',
  threadId: 'thread-1',
  userId: 'user-1',
};

describe('missing brand context layer', () => {
  it('renders the askable fields into the turn prompt with scan suggestions', async () => {
    const service = createService();
    const context = await service.assembleContext(PARAMS);
    expect(context?.missingBrandContext?.fields).toEqual([
      { field: 'offer', status: 'missing' },
    ]);
    expect(context?.layersUsed).toContain('missingBrandContext');
    if (!context) throw new Error('Expected a brand context');
    const prompt = service.buildSystemPrompt('BASE', context);
    expect(prompt).toContain(MISSING_BRAND_CONTEXT_HEADER);
    expect(prompt).toContain(
      'Offer (field: offer, missing): requestId: brand_context:offer; single select; options: Coaching (id: suggested_1), Skip (id: skip); reason: "so calls to action point at what you sell"',
    );
  });

  it('stays off unless the caller turns it on', async () => {
    const service = createService();
    const context = await service.assembleContext({
      ...PARAMS,
      layers: undefined,
    });
    expect(context?.missingBrandContext).toBeUndefined();
    if (!context) throw new Error('Expected a brand context');
    expect(service.buildSystemPrompt('BASE', context)).not.toContain(
      MISSING_BRAND_CONTEXT_HEADER,
    );
  });

  it('never asks for the member fallback brand without an explicit brand scope', async () => {
    const context = await createService().assembleContext({
      ...PARAMS,
      brandId: undefined,
    });
    expect(context?.brandId).toBe('brand-1');
    expect(context?.missingBrandContext).toBeUndefined();
  });

  it('adds nothing once this conversation asked its question', async () => {
    const context = await createService(
      createBrand({
        brandContextAsks: {
          tone: { askedAt: '2026-01-01T00:00:00.000Z', threadId: 'thread-1' },
        },
      }),
    ).assembleContext(PARAMS);
    expect(context?.missingBrandContext).toBeUndefined();
    expect(context?.layersUsed).not.toContain('missingBrandContext');
  });

  it('adds nothing for a brand with nothing missing', async () => {
    const context = await createService(
      createBrand({
        strategy: {
          ...createBrand().agentConfig.strategy,
          offers: ['Coaching'],
        },
      }),
    ).assembleContext(PARAMS);
    expect(context?.missingBrandContext).toBeUndefined();
  });
});
