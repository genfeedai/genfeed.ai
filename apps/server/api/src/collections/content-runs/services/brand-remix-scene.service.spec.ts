import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import type { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import type { RequestWithContext } from '@api/common/middleware/request-context.middleware';
import {
  BRAND_REMIX_RUN_CONTRACT,
  BrandRemixOrganicPlatform,
  brandRemixRunConfigSchema,
} from '@genfeedai/contracts/api-types/contracts/brand-remix-run.contract';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BrandRemixSceneService } from './brand-remix-scene.service';
import type { BrandRemixSceneQuoteService } from './brand-remix-scene-quote.service';
import type { BrandRemixSceneSourceService } from './brand-remix-scene-source.service';
import {
  initialScenePipeline,
  sceneInputHash,
} from './brand-remix-scene-state';
import type { BrandRemixSceneStoreService } from './brand-remix-scene-store.service';
import type { BrandRemixSceneWorkflowService } from './brand-remix-scene-workflow.service';

const user: AuthenticatedUser = {
  id: 'user',
  userId: 'user',
  organizationId: 'org',
  brandId: 'brand',
};
function fixture() {
  return brandRemixRunConfigSchema.parse({
    contract: BRAND_REMIX_RUN_CONTRACT,
    version: 1,
    recipeVersion: 1,
    revision: 1,
    phase: 'prefilled',
    readiness: { state: 'ready', issues: [] },
    draft: {
      fidelityMode: 'guided',
      identity: { avatarAssetId: 'avatar', speechVoiceId: 'voice' },
      intent: { objective: 'Meet Brand' },
      output: { kind: 'avatar', count: 1, aspectRatio: '9:16' },
      references: [],
      reviewRequired: true,
      target: {
        kind: 'organic',
        platform: BrandRemixOrganicPlatform.INSTAGRAM,
      },
    },
    sourceSnapshot: {
      capturedAt: '2026-09-24T00:00:00.000Z',
      evidence: [],
      metrics: {},
      pattern: {},
      platform: 'instagram',
      selector: { kind: 'source_post', sourcePostId: 'source' },
      sourceId: 'source',
      title: 'Imported source',
    },
    scenePipeline: initialScenePipeline(),
  });
}
describe('scene façade spending and persistence boundaries', () => {
  let config = fixture();
  let runUpdatedAt = new Date();
  const store = { read: vi.fn(), save: vi.fn(), view: vi.fn() };
  const quotes = { build: vi.fn() };
  const source = { prepare: vi.fn(), libraryAsset: vi.fn() };
  const workflow = { enqueue: vi.fn() };
  const credits = {
    checkOrganizationCreditsAvailable: vi.fn(),
    releaseReservation: vi.fn(),
  };
  let service: BrandRemixSceneService;
  beforeEach(() => {
    vi.clearAllMocks();
    config = fixture();
    runUpdatedAt = new Date();
    store.read.mockImplementation(async (_org, _run, revision) => {
      if (revision !== undefined && revision !== config.revision)
        throw new Error('stale');
      return { config, brandId: 'brand', run: { updatedAt: runUpdatedAt } };
    });
    store.save.mockImplementation(async (_org, _run, _old, next) => {
      config = brandRemixRunConfigSchema.parse(next);
      return config;
    });
    store.view.mockImplementation(async () => config);
    quotes.build.mockImplementation(async () => ({
      id: 'quote',
      revision: config.revision,
      operation: 'analysis',
      inputHash: sceneInputHash(config),
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      total: 2,
      items: [
        {
          key: 'run-transcription-1',
          stage: 'transcription',
          model: 'whisper',
          credits: 1,
          billingMode: 'platform',
          attempt: 1,
        },
        {
          key: 'run-analysis-1',
          stage: 'analysis',
          model: 'semantic',
          credits: 1,
          billingMode: 'platform',
          attempt: 1,
        },
      ],
    }));
    source.prepare.mockResolvedValue({
      sourceAssetId: 'video',
      durationSeconds: 10,
      sizeBytes: 1000,
    });
    source.libraryAsset.mockResolvedValue({
      sourceAssetId: 'library-video',
      assetUpdatedAt: '2026-09-24T00:00:00.000Z',
    });
    credits.checkOrganizationCreditsAvailable.mockResolvedValue(true);
    service = new BrandRemixSceneService(
      store as unknown as BrandRemixSceneStoreService,
      quotes as unknown as BrandRemixSceneQuoteService,
      source as unknown as BrandRemixSceneSourceService,
      workflow as unknown as BrandRemixSceneWorkflowService,
      credits as unknown as CreditsUtilsService,
    );
  });
  it('quotes without enqueueing or checking/debiting credits', async () => {
    await service.quote('org', 'run', user, {
      expectedRevision: 1,
      operation: 'analysis',
    });
    expect(config.scenePipeline?.quote?.total).toBe(2);
    expect(workflow.enqueue).not.toHaveBeenCalled();
    expect(credits.checkOrganizationCreditsAvailable).not.toHaveBeenCalled();
  });
  it('requires explicit acceptance and queues the same quote once', async () => {
    await expect(
      service.execute('org', 'run', user, {} as RequestWithContext, {
        expectedRevision: 1,
        quoteId: 'missing',
      }),
    ).rejects.toThrow();
    await service.quote('org', 'run', user, {
      expectedRevision: 1,
      operation: 'analysis',
    });
    await service.execute('org', 'run', user, {} as RequestWithContext, {
      expectedRevision: 1,
      quoteId: 'quote',
    });
    await service.execute('org', 'run', user, {} as RequestWithContext, {
      expectedRevision: 1,
      quoteId: 'quote',
    });
    expect(workflow.enqueue).toHaveBeenCalledTimes(1);
    expect(config.scenePipeline?.analysis?.transcription.state).toBe('pending');
  });
  it('rejects a price increase before enqueue', async () => {
    await service.quote('org', 'run', user, {
      expectedRevision: 1,
      operation: 'analysis',
    });
    const quote = config.scenePipeline?.quote;
    if (!quote) throw new Error('missing quote');
    quotes.build.mockResolvedValue({
      ...quote,
      total: 3,
    });
    await expect(
      service.execute('org', 'run', user, {} as RequestWithContext, {
        expectedRevision: 1,
        quoteId: 'quote',
      }),
    ).rejects.toThrow('Pricing');
    expect(workflow.enqueue).not.toHaveBeenCalled();
  });
  it('cancels future dispatch and resumes the same authorization with a new fence', async () => {
    await service.quote('org', 'run', user, {
      expectedRevision: 1,
      operation: 'analysis',
    });
    await service.execute('org', 'run', user, {} as RequestWithContext, {
      expectedRevision: 1,
      quoteId: 'quote',
    });
    const operationId = config.scenePipeline?.operation?.id;
    await service.cancel('org', 'run', { expectedRevision: 1 });
    expect(config.scenePipeline?.cancellationGeneration).toBe(1);
    await service.resume('org', 'run', user, { expectedRevision: 1 });
    expect(config.scenePipeline?.operation?.id).toBe(operationId);
    expect(config.scenePipeline?.operation?.cancellationGeneration).toBe(1);
  });
  it('preserves imported provenance and incurred receipts when attaching Library media', async () => {
    const sourceSnapshot = structuredClone(config.sourceSnapshot);
    const pipeline = config.scenePipeline;
    if (!pipeline) throw new Error('missing pipeline');
    pipeline.receipts.push({
      key: 'paid',
      amount: 1,
      billingMode: 'platform',
      state: 'settled',
    });
    await service.attachSource('org', 'run', user, {
      expectedRevision: 1,
      assetId: 'library-video',
    });
    expect(config.sourceSnapshot).toEqual(sourceSnapshot);
    expect(config.analysisSource?.selectedByUserId).toBe('user');
    expect(config.scenePipeline?.receipts[0].state).toBe('settled');
    expect(workflow.enqueue).not.toHaveBeenCalled();
    const revision = config.revision;
    await service.attachSource('org', 'run', user, {
      expectedRevision: revision,
      assetId: 'library-video',
    });
    expect(config.revision).toBe(revision);
  });
  it('rejects strict fidelity before quoting, dispatch, or resume', async () => {
    config.draft.fidelityMode = 'strict';
    await expect(
      service.quote('org', 'run', user, {
        expectedRevision: 1,
        operation: 'analysis',
      }),
    ).rejects.toThrow(/Strict fidelity/);
    config.scenePipeline = {
      ...initialScenePipeline(),
      quote: config.scenePipeline?.quote,
    };
    config.draft.fidelityMode = 'strict';
    await expect(
      service.execute('org', 'run', user, {} as RequestWithContext, {
        expectedRevision: 1,
        quoteId: 'quote',
      }),
    ).rejects.toThrow(/Strict fidelity/);
    await expect(
      service.resume('org', 'run', user, { expectedRevision: 1 }),
    ).rejects.toThrow(/Strict fidelity/);
    expect(quotes.build).not.toHaveBeenCalled();
    expect(workflow.enqueue).not.toHaveBeenCalled();
    expect(credits.checkOrganizationCreditsAvailable).not.toHaveBeenCalled();
  });
  it('refuses to resume a live step chain but recovers one that stopped writing', async () => {
    await service.quote('org', 'run', user, {
      expectedRevision: 1,
      operation: 'analysis',
    });
    await service.execute('org', 'run', user, {} as RequestWithContext, {
      expectedRevision: 1,
      quoteId: 'quote',
    });
    await expect(
      service.resume('org', 'run', user, { expectedRevision: 1 }),
    ).rejects.toThrow('still running');
    expect(workflow.enqueue).toHaveBeenCalledTimes(1);
    runUpdatedAt = new Date(Date.now() - 20 * 60_000);
    await service.resume('org', 'run', user, { expectedRevision: 1 });
    expect(workflow.enqueue).toHaveBeenCalledTimes(2);
    expect(config.scenePipeline?.operation?.sequence).toBe(1);
  });
  it('rejects cancelling when no scene operation is running', async () => {
    await expect(
      service.cancel('org', 'run', { expectedRevision: 1 }),
    ).rejects.toThrow('No scene operation');
    expect(store.save).not.toHaveBeenCalled();
  });
  it('blocks another quote while accepted scene work is unreconciled', async () => {
    const pipeline = config.scenePipeline;
    if (!pipeline) throw new Error('missing pipeline');
    pipeline.state = 'cancelled';
    pipeline.scenes.scene = {
      identity: { avatarAssetId: 'avatar', speechVoiceId: 'voice' },
      referenceAssetIds: [],
      image: { attempt: 1, state: 'submitted', assetId: 'still' },
      video: { attempt: 1, state: 'pending' },
      replacedAssetIds: [],
    };
    await expect(
      service.quote('org', 'run', user, {
        expectedRevision: 1,
        operation: 'generate',
      }),
    ).rejects.toThrow('Resume or cancel');
    expect(quotes.build).not.toHaveBeenCalled();
  });
  it('cancels by reconciling accepted provider work and releasing abandoned platform holds', async () => {
    const pipeline = config.scenePipeline;
    if (!pipeline) throw new Error('missing pipeline');
    config.phase = 'generating';
    pipeline.state = 'assembling';
    pipeline.operation = {
      id: 'op',
      quoteId: 'quote',
      revision: 1,
      cancellationGeneration: 0,
      startedAt: new Date().toISOString(),
      userId: 'user',
      sequence: 3,
    };
    pipeline.quote = {
      id: 'quote',
      revision: 1,
      operation: 'generate',
      inputHash: 'hash',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      total: 1,
      items: [
        {
          key: 'run-captions-1',
          stage: 'captions',
          model: 'whisper',
          credits: 1,
          billingMode: 'platform',
          attempt: 1,
        },
      ],
    };
    pipeline.scenes.scene = {
      identity: { avatarAssetId: 'avatar', speechVoiceId: 'voice' },
      referenceAssetIds: [],
      image: { attempt: 1, state: 'ready', assetId: 'still' },
      video: { attempt: 1, state: 'submitted', assetId: 'clip' },
      replacedAssetIds: [],
    };
    pipeline.assembly = {
      orderedAssetIds: [],
      transcription: { attempt: 1, state: 'uncertain' },
    };
    pipeline.receipts.push({
      key: 'remix-run-op-run-captions-1',
      operationId: 'op',
      actorUserId: 'user',
      amount: 1,
      billingMode: 'platform',
      state: 'reserved',
    });
    await service.cancel('org', 'run', { expectedRevision: 1 });
    expect(config.phase).toBe('prefilled');
    expect(config.scenePipeline?.state).toBe('cancelled');
    expect(config.scenePipeline?.assembly?.transcription.state).toBe('failed');
    expect(config.scenePipeline?.receipts[0].state).toBe('released');
    expect(credits.releaseReservation).toHaveBeenCalledWith({
      organizationId: 'org',
      idempotencyKey: 'remix-run-op-run-captions-1',
    });
    expect(workflow.enqueue).toHaveBeenCalledWith(
      'org',
      'run',
      expect.objectContaining({ id: 'op', sequence: 4 }),
      10_000,
    );
  });
  it('re-triggers reconciliation of accepted work on a cancelled run without dispatching', async () => {
    const pipeline = config.scenePipeline;
    if (!pipeline) throw new Error('missing pipeline');
    pipeline.state = 'cancelled';
    pipeline.operation = {
      id: 'op',
      quoteId: 'quote',
      revision: 1,
      cancellationGeneration: 0,
      startedAt: new Date().toISOString(),
      userId: 'user',
      sequence: 5,
    };
    pipeline.cancellationGeneration = 1;
    pipeline.scenes.scene = {
      identity: { avatarAssetId: 'avatar', speechVoiceId: 'voice' },
      referenceAssetIds: [],
      image: { attempt: 1, state: 'ready', assetId: 'still' },
      video: { attempt: 1, state: 'submitted', assetId: 'clip' },
      replacedAssetIds: [],
    };
    await service.cancel('org', 'run', { expectedRevision: 1 });
    expect(config.scenePipeline?.state).toBe('cancelled');
    expect(config.scenePipeline?.cancellationGeneration).toBe(1);
    expect(workflow.enqueue).toHaveBeenCalledWith(
      'org',
      'run',
      expect.objectContaining({ id: 'op', sequence: 6 }),
    );
  });
  it('rejects cancelling reviewed output', async () => {
    config.phase = 'in_review';
    await expect(
      service.cancel('org', 'run', { expectedRevision: 1 }),
    ).rejects.toThrow('immutable');
    expect(store.save).not.toHaveBeenCalled();
  });
});

vi.mock(
  '@api/collections/content-runs/services/brand-remix-scene-store.service',
  () => ({ BrandRemixSceneStoreService: class {} }),
);
vi.mock(
  '@api/collections/content-runs/services/brand-remix-scene-quote.service',
  () => ({ BrandRemixSceneQuoteService: class {} }),
);
vi.mock(
  '@api/collections/content-runs/services/brand-remix-scene-source.service',
  () => ({ BrandRemixSceneSourceService: class {} }),
);
vi.mock(
  '@api/collections/content-runs/services/brand-remix-scene-workflow.service',
  () => ({ BrandRemixSceneWorkflowService: class {} }),
);
vi.mock('@api/collections/credits/services/credits.utils.service', () => ({
  CreditsUtilsService: class {},
}));
