import { KnowledgeContextCoverageService } from '@api/collections/contexts/services/knowledge-context-coverage.service';
import { AgentContextAssemblyService } from '@api/services/agent-context-assembly/agent-context-assembly.service';
import {
  KNOWLEDGE_COVERAGE_HEADER,
  RETRIEVED_BRAND_MEMORY_HEADER,
} from '@api/services/agent-context-assembly/brand-context-budget.util';
import type { AssembleContextParams } from '@api/services/agent-context-assembly/interfaces/context-assembly.interface';
import { brandAccessFixture } from '@api/shared/testing/brand-access.fixture';
import {
  KnowledgeProcessingState,
  KnowledgeRetentionState,
  KnowledgeRetrievalState,
} from '@genfeedai/contracts';
import { describe, expect, it, vi } from 'vitest';

function source(
  id: string,
  processingState: `${KnowledgeProcessingState}` = KnowledgeProcessingState.READY,
) {
  return {
    id,
    lastSuccessfulSyncAt: null,
    staleAt: null,
    syncState: null,
    title: `Source ${id}`,
    versions: [
      {
        expiresAt: null,
        processingState,
        retentionState: KnowledgeRetentionState.RETAINED,
        retrievalState: KnowledgeRetrievalState.ACTIVE,
      },
    ],
  };
}

interface FixtureOptions {
  readSources?: () => Promise<ReturnType<typeof source>[]>;
  withoutCoverage?: boolean;
}

/** Real coverage derivation over a fake database; only storage is faked. */
function createService({ readSources, withoutCoverage }: FixtureOptions = {}) {
  const coverage = new KnowledgeContextCoverageService(
    {
      credential: { findMany: vi.fn().mockResolvedValue([]) },
      knowledgeSource: {
        findMany: vi.fn(readSources ?? (async () => [source('a')])),
      },
    } as never,
    { assert: vi.fn(), resolve: vi.fn() } as never,
    {
      ownership: vi.fn().mockResolvedValue({
        isDeleted: false,
        organizationId: 'org-1',
      }),
    } as never,
    { warn: vi.fn() } as never,
  );
  return new AgentContextAssemblyService(
    {
      brandAccessService: brandAccessFixture(),
      findOne: vi.fn().mockResolvedValue({
        id: 'brand-1',
        label: 'Acme',
        organizationId: 'org-1',
      }),
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
    withoutCoverage ? undefined : coverage,
  );
}

const PARAMS: AssembleContextParams = {
  brandId: 'brand-1',
  organizationId: 'org-1',
  query: 'what is our refund policy',
  userId: 'user-1',
};

async function promptFor(
  service: AgentContextAssemblyService,
  params: AssembleContextParams = PARAMS,
) {
  const context = await service.assembleContext(params);
  if (!context) throw new Error('Expected a brand context');
  return { context, prompt: service.buildSystemPrompt('BASE', context) };
}

describe('Knowledge coverage in assembled answer context', () => {
  it('tells the model which Knowledge could not be fully read', async () => {
    const { context, prompt } = await promptFor(
      createService({
        readSources: async () => [
          source('a'),
          source('b', KnowledgeProcessingState.FAILED),
        ],
      }),
    );
    expect(context.layersUsed).toContain('contextCoverage');
    expect(prompt).toContain(KNOWLEDGE_COVERAGE_HEADER);
    expect(prompt).toContain(
      'Coverage is incomplete: brand truth knowledge (partial)',
    );
    expect(prompt).toContain('say that source could not be fully read');
  });

  it('adds nothing when every Knowledge source is readable', async () => {
    const { context, prompt } = await promptFor(createService());
    expect(context.contextCoverage).toBeUndefined();
    expect(context.layersUsed).not.toContain('contextCoverage');
    expect(prompt).not.toContain(KNOWLEDGE_COVERAGE_HEADER);
  });

  it('reports a failed read as incomplete, never as empty', async () => {
    const { prompt } = await promptFor(
      createService({
        readSources: async () => {
          throw new Error('database unavailable');
        },
      }),
    );
    expect(prompt).toContain(
      'Coverage is incomplete: brand truth knowledge (failed)',
    );
  });

  it('keeps the limitation when retrieval context fills the budget', async () => {
    const service = createService({
      readSources: async () => [source('a', KnowledgeProcessingState.QUEUED)],
    });
    const context = await service.assembleContext(PARAMS);
    if (!context) throw new Error('Expected a brand context');
    context.ragEntries = Array.from({ length: 30 }, (_, index) => ({
      citation: {
        title: `Memory ${index}`,
      } as never,
      content: 'x'.repeat(400),
      relevance: 0.5,
    }));
    const { prompt, brandContext } = service.renderSystemPrompt(
      'BASE',
      context,
      {
        maxBrandContextLength: 1500,
      },
    );
    expect(prompt).toContain(KNOWLEDGE_COVERAGE_HEADER);
    expect(
      brandContext.sections.find(
        (section) => section.header === RETRIEVED_BRAND_MEMORY_HEADER,
      )?.status,
    ).not.toBe('kept');
  });

  it.each([
    ['no explicit brand scope', { brandId: undefined }],
    ['no query', { query: undefined }],
    ['the layer turned off', { layers: { contextCoverage: false } }],
  ])('does not read coverage with %s', async (_name, override) => {
    const { context } = await promptFor(
      createService({
        readSources: async () => [source('b', KnowledgeProcessingState.FAILED)],
      }),
      { ...PARAMS, ...override },
    );
    expect(context.contextCoverage).toBeUndefined();
  });

  it('works without the coverage service', async () => {
    const { context } = await promptFor(
      createService({ withoutCoverage: true }),
    );
    expect(context.contextCoverage).toBeUndefined();
  });
});
