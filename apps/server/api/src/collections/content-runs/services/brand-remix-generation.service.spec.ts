import { BrandRemixGenerationService } from '@api/collections/content-runs/services/brand-remix-generation.service';
import { quoteSnapshotHash } from '@api/helpers/utils/credits/quote-snapshot.util';
import { ContentRunStatus, ModelCategory } from '@genfeedai/contracts';
import {
  type BrandRemixRunConfig,
  brandRemixRunConfigSchema,
} from '@genfeedai/contracts/api-types/contracts/brand-remix-run.contract';
import {
  LLM_DEFAULTS,
  sourcePostVariationCredits,
} from '@genfeedai/contracts/constants';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const instant = '2026-09-24T12:00:00.000Z';
const user = { organizationId: 'org-1', userId: 'user-1' };
const brief = {
  version: 1,
  mediaKind: 'image',
  fidelityMode: 'guided',
  constraints: [],
  references: [],
  provenance: [],
  intent: {
    objective: 'Original brand story',
    subjects: [],
    requestedText: [],
  },
  output: { aspectRatio: '1:1' },
};
function fixture() {
  return brandRemixRunConfigSchema.parse({
    contract: 'brand-remix-run',
    version: 1,
    recipeVersion: 1,
    revision: 1,
    phase: 'prefilled',
    draft: {
      fidelityMode: 'guided',
      identity: {},
      intent: { objective: 'Original brand story' },
      output: { kind: 'image', count: 2, aspectRatio: '1:1' },
      references: [],
      reviewRequired: true,
      target: { kind: 'organic', platform: 'instagram' },
    },
    concept: {
      angle: 'A better way',
      hook: 'See the result',
      script: 'A complete original story',
      storyboard: [{ ordinal: 1, visualIntent: 'Product on desk' }],
      savedAt: instant,
    },
    sourceSnapshot: {
      capturedAt: instant,
      evidence: [],
      metrics: {},
      pattern: {},
      platform: 'instagram',
      selector: { kind: 'source_post', sourcePostId: 'source-1' },
      sourceId: 'source-1',
      title: 'Source',
    },
    readiness: { issues: [], state: 'ready' },
  });
}

describe('BrandRemixGenerationService exact quotes', () => {
  let config: BrandRemixRunConfig;
  let now: Date;
  const run = () => ({
    id: 'run-1',
    brandId: 'brand-1',
    organizationId: 'org-1',
    config,
    status: ContentRunStatus.PENDING,
    createdAt: new Date(instant),
    updatedAt: new Date(instant),
    isDeleted: false,
  });
  const persistence = {
    requireRun: vi.fn(),
    parseConfig: vi.fn(),
    requireBrandId: vi.fn(),
    compareAndSwapExactConfig: vi.fn(),
  };
  const planning = {
    resolveBrandContext: vi.fn(),
    resolveSource: vi.fn(),
    assertReadyForGeneration: vi.fn(),
    buildGenerationBrief: vi.fn(),
  };
  const runs = { get: vi.fn(), start: vi.fn() };
  const imageCredits = { quoteCredits: vi.fn() };
  const models = { validateModelForOrg: vi.fn() };
  const prisma = {
    ingredient: { findMany: vi.fn() },
    asset: { findMany: vi.fn() },
  };
  const runtime = { now: () => now, randomId: vi.fn() };
  let service: BrandRemixGenerationService;
  const quote = () =>
    service.quote('org-1', 'run-1', user as never, {
      expectedRevision: 1,
      model: 'image-model',
    });
  const execute = (quoteId = config.generationQuote?.id) =>
    service.execute('org-1', 'run-1', user as never, {} as never, {
      expectedRevision: 1,
      quoteId,
    });

  beforeEach(() => {
    vi.resetAllMocks();
    config = fixture();
    now = new Date(instant);
    persistence.requireRun.mockImplementation(async () => run());
    persistence.parseConfig.mockImplementation((value) =>
      brandRemixRunConfigSchema.parse(value),
    );
    persistence.requireBrandId.mockReturnValue('brand-1');
    persistence.compareAndSwapExactConfig.mockImplementation(
      async ({ nextConfig }) => {
        config = nextConfig;
        return run();
      },
    );
    planning.resolveBrandContext.mockResolvedValue({
      brand: { id: 'brand-1', text: 'Brand voice' },
      brandKit: { references: [] },
    });
    planning.resolveSource.mockImplementation(async () => ({
      snapshot: config.sourceSnapshot,
    }));
    planning.assertReadyForGeneration.mockResolvedValue({
      issues: [],
      state: 'ready',
    });
    planning.buildGenerationBrief.mockReturnValue(brief);
    imageCredits.quoteCredits.mockResolvedValue({
      unitCredits: 4,
      billingMode: 'credits',
      pricingHash: 'price-1',
      provider: 'fal',
    });
    models.validateModelForOrg.mockResolvedValue({
      key: 'image-model',
      category: ModelCategory.IMAGE,
      isActive: true,
      isDeleted: false,
    });
    runs.get.mockImplementation(async () => ({ ...config, id: 'run-1' }));
    runs.start.mockResolvedValue({ id: 'run-1', phase: 'generating' });
    prisma.ingredient.findMany.mockResolvedValue([]);
    prisma.asset.findMany.mockResolvedValue([]);
    runtime.randomId.mockReturnValue('quote-1');
    service = new BrandRemixGenerationService(
      persistence as never,
      planning as never,
      runs as never,
      imageCredits as never,
      models as never,
      prisma as never,
      runtime,
    );
  });

  it('persists one exact price for each canonical variant without starting or incrementing revision', async () => {
    await quote();
    expect(config.generationQuote).toMatchObject({
      id: 'quote-1',
      revision: 1,
      count: 2,
      model: 'image-model',
      unitCredits: 4,
      total: 8,
      expiresAt: '2026-09-24T12:15:00.000Z',
    });
    expect(imageCredits.quoteCredits).toHaveBeenCalledWith(
      expect.objectContaining({ outputs: 1, width: 1024, height: 1024 }),
      'image-model',
      'org-1',
    );
    expect(config.revision).toBe(1);
    expect(runs.start).not.toHaveBeenCalled();
  });

  it('accepts once and supplies only an in-memory exact constraint to canonical start', async () => {
    await quote();
    await execute();
    expect(config.generationQuote?.acceptedAt).toBe(instant);
    expect(runs.start).toHaveBeenCalledWith(
      'org-1',
      'run-1',
      user,
      expect.objectContaining({
        approvedRemixQuoteId: 'quote-1',
        creditsConfig: expect.objectContaining({
          amount: 4,
          deferred: true,
          approvedImageQuote: {
            model: 'image-model',
            unitCredits: 4,
            billingMode: 'credits',
            pricingHash: 'price-1',
          },
        }),
      }),
      { expectedRevision: 1 },
    );
  });

  it('quotes copy with canonical model and credits and rejects arbitrary copy models', async () => {
    config.draft.output = { kind: 'copy', count: 3 };
    await expect(quote()).rejects.toThrow('canonical background model');
    await service.quote('org-1', 'run-1', user as never, {
      expectedRevision: 1,
    });
    expect(config.generationQuote).toMatchObject({
      model: LLM_DEFAULTS.background,
      billingMode: 'credits',
      unitCredits: sourcePostVariationCredits(1),
      total: 3 * sourcePostVariationCredits(1),
    });
    expect(imageCredits.quoteCredits).not.toHaveBeenCalled();
  });

  it('retains unit price but quotes zero platform credits for BYOK', async () => {
    imageCredits.quoteCredits.mockResolvedValue({
      unitCredits: 4,
      billingMode: 'byok',
      provider: 'fal',
      pricingHash: 'byok-price',
    });
    await quote();
    await execute();
    expect(config.generationQuote).toMatchObject({
      unitCredits: 4,
      total: 0,
      billingMode: 'byok',
    });
    expect(runs.start.mock.calls[0]?.[3].creditsConfig.isByokBypass).toBe(true);
  });

  it.each(['missing model', 'retired successor', 'wrong category', 'inactive'])(
    'rejects %s without saving or dispatching',
    async (failure) => {
      if (failure === 'retired successor')
        models.validateModelForOrg.mockResolvedValue({
          key: 'successor',
          category: ModelCategory.IMAGE,
          isActive: true,
        });
      if (failure === 'wrong category')
        models.validateModelForOrg.mockResolvedValue({
          key: 'image-model',
          category: ModelCategory.VIDEO,
          isActive: true,
        });
      if (failure === 'inactive')
        models.validateModelForOrg.mockResolvedValue({
          key: 'image-model',
          category: ModelCategory.IMAGE,
          isActive: false,
        });
      await expect(
        service.quote('org-1', 'run-1', user as never, {
          expectedRevision: 1,
          ...(failure === 'missing model' ? {} : { model: 'image-model' }),
        }),
      ).rejects.toThrow();
      expect(persistence.compareAndSwapExactConfig).not.toHaveBeenCalled();
      expect(runs.start).not.toHaveBeenCalled();
    },
  );

  it.each([
    'expired',
    'price',
    'byok',
    'model',
    'brand',
    'source',
    'count',
    'reference',
  ])(
    'rejects changed %s before acceptance or provider work',
    async (change) => {
      if (change === 'reference') {
        config.draft.references = [
          { assetId: 'ref-1', role: 'product', source: 'explicit' },
        ];
        prisma.ingredient.findMany.mockResolvedValue([
          { id: 'ref-1', updatedAt: new Date(instant), status: 'GENERATED' },
        ]);
      }
      await quote();
      persistence.compareAndSwapExactConfig.mockClear();
      if (change === 'expired') now = new Date('2026-09-24T12:15:00.000Z');
      if (change === 'price')
        imageCredits.quoteCredits.mockResolvedValue({
          unitCredits: 5,
          billingMode: 'credits',
          pricingHash: 'price-2',
          provider: 'fal',
        });
      if (change === 'byok')
        imageCredits.quoteCredits.mockResolvedValue({
          unitCredits: 4,
          billingMode: 'byok',
          pricingHash: 'price-1',
          provider: 'fal',
        });
      if (change === 'model')
        models.validateModelForOrg.mockResolvedValue({
          key: 'successor',
          category: ModelCategory.IMAGE,
          isActive: true,
        });
      if (change === 'brand')
        planning.resolveBrandContext.mockResolvedValue({
          brand: { text: 'Changed brand voice' },
        });
      if (change === 'source')
        planning.resolveSource.mockResolvedValue({
          snapshot: { ...config.sourceSnapshot, title: 'Changed source' },
        });
      if (change === 'count') config.draft.output.count = 3;
      if (change === 'reference')
        prisma.ingredient.findMany.mockResolvedValue([
          {
            id: 'ref-1',
            updatedAt: new Date('2026-09-24T12:01:00.000Z'),
            status: 'GENERATED',
          },
        ]);
      await expect(execute()).rejects.toThrow();
      expect(persistence.compareAndSwapExactConfig).not.toHaveBeenCalled();
      expect(runs.start).not.toHaveBeenCalled();
    },
  );

  it('rejects a missing reference instead of sanitizing it away', async () => {
    config.draft.references = [
      { assetId: 'missing', role: 'product', source: 'explicit' },
    ];
    await expect(quote()).rejects.toThrow('reference is unavailable');
    expect(persistence.compareAndSwapExactConfig).not.toHaveBeenCalled();
    expect(prisma.ingredient.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org-1',
          isDeleted: false,
        }),
      }),
    );
  });

  it('rejects stale/foreign quotes and revision races', async () => {
    await quote();
    await expect(execute('foreign')).rejects.toThrow('does not match');
    await expect(
      service.execute('org-1', 'run-1', user as never, {} as never, {
        expectedRevision: 2,
        quoteId: 'quote-1',
      }),
    ).rejects.toThrow();
    persistence.compareAndSwapExactConfig.mockResolvedValue(null);
    await expect(execute()).rejects.toThrow('changed before');
    expect(runs.start).not.toHaveBeenCalled();
  });

  it('replaces an unaccepted quote and invalidates its previous ID', async () => {
    await quote();
    runtime.randomId.mockReturnValue('quote-2');
    await quote();
    await expect(execute('quote-1')).rejects.toThrow('does not match');
    expect(config.generationQuote?.id).toBe('quote-2');
  });

  it('allows crash recovery after acceptance only while unchanged and unexpired', async () => {
    await quote();
    await execute();
    runs.start.mockClear();
    await execute();
    expect(runs.start).toHaveBeenCalledTimes(1);
    now = new Date('2026-09-24T13:00:00.000Z');
    await expect(execute()).rejects.toThrow('expired');
  });

  it.each(['generating', 'ready_for_review', 'failed'] as const)(
    'replays accepted %s execution without another paid attempt, even after expiry',
    async (phase) => {
      await quote();
      await execute();
      runs.start.mockClear();
      config = brandRemixRunConfigSchema.parse({
        ...config,
        phase,
        execution: {
          actualCount: 0,
          requestedCount: 2,
          generationBrief: brief,
          variants: [],
          workflowExecutionId: 'workflow-execution-1',
        },
      });
      now = new Date('2026-09-24T13:00:00.000Z');
      await execute();
      expect(runs.start).not.toHaveBeenCalled();
      if (phase === 'failed')
        await expect(quote()).rejects.toThrow('Revise the saved concept');
    },
  );

  it('resumes an accepted execution record that crashed before any generation claim', async () => {
    await quote();
    await execute();
    runs.start.mockClear();
    config = brandRemixRunConfigSchema.parse({
      ...config,
      phase: 'generating',
      execution: {
        actualCount: 0,
        requestedCount: 2,
        generationBrief: brief,
        variants: [
          {
            id: 'variant-1',
            recipeRevision: 1,
            status: 'queued',
            assetIds: [],
          },
        ],
      },
    });
    await execute();
    expect(runs.start).toHaveBeenCalledTimes(1);
    runs.start.mockClear();
    now = new Date('2026-09-24T13:00:00.000Z');
    await expect(execute()).rejects.toThrow('expired');
    expect(runs.start).not.toHaveBeenCalled();
  });

  it('returns the canonical run when the same quote wins concurrent acceptance', async () => {
    await quote();
    persistence.compareAndSwapExactConfig.mockImplementation(
      async ({ nextConfig }) => {
        config = nextConfig;
        return null;
      },
    );
    await execute();
    expect(runs.start).not.toHaveBeenCalled();
    expect(runs.get).toHaveBeenLastCalledWith('org-1', 'run-1');
  });

  it('fails foreign run lookup without reading material or dispatching', async () => {
    persistence.requireRun.mockRejectedValue(new Error('not found'));
    await expect(quote()).rejects.toThrow('not found');
    expect(planning.resolveSource).not.toHaveBeenCalled();
    expect(runs.start).not.toHaveBeenCalled();
  });

  it('sorts object keys recursively while preserving material array order', () => {
    expect(quoteSnapshotHash({ b: { d: 1, c: 2 }, a: [1, 2] })).toBe(
      quoteSnapshotHash({ a: [1, 2], b: { c: 2, d: 1 } }),
    );
    expect(quoteSnapshotHash([1, 2])).not.toBe(quoteSnapshotHash([2, 1]));
  });
});
