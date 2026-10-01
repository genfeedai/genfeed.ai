import type { AvatarVideoGenerationService } from '@api/collections/videos/services/avatar-video-generation.service';
import type { ByokService } from '@api/services/byok/byok.service';
import type { AgentGenerationEstimateService } from '@api/services/router/agent-generation-estimate.service';
import { ByokProvider } from '@genfeedai/contracts';
import {
  BRAND_REMIX_RUN_CONTRACT,
  BrandRemixOrganicPlatform,
  brandRemixRunConfigSchema,
} from '@genfeedai/contracts/api-types/contracts/brand-remix-run.contract';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrandRemixRunPlanningService } from './brand-remix-run-planning.service';
import { BrandRemixSceneQuoteService } from './brand-remix-scene-quote.service';
import type { BrandRemixSceneSourceService } from './brand-remix-scene-source.service';

vi.mock(
  '@api/collections/content-runs/services/brand-remix-run-planning.service',
  () => ({ BrandRemixRunPlanningService: class {} }),
);
vi.mock(
  '@api/collections/content-runs/services/brand-remix-scene-source.service',
  () => ({ BrandRemixSceneSourceService: class {} }),
);
vi.mock(
  '@api/collections/videos/services/avatar-video-generation.service',
  () => ({ AvatarVideoGenerationService: class {} }),
);
vi.mock('@api/services/byok/byok.service', () => ({ ByokService: class {} }));
vi.mock('@api/services/router/agent-generation-estimate.service', () => ({
  AgentGenerationEstimateService: class {},
}));

function config() {
  return brandRemixRunConfigSchema.parse({
    concept: {
      savedAt: '2026-09-24T00:00:00.000Z',
      storyboard: [
        {
          durationSeconds: 5,
          id: 'scene-a',
          narration: 'Meet the brand',
          ordinal: 1,
          visualIntent: 'Founder holds the product',
        },
        {
          durationSeconds: 5,
          id: 'scene-b',
          narration: 'Show the product',
          ordinal: 2,
          visualIntent: 'Product on the desk',
        },
      ],
    },
    contract: BRAND_REMIX_RUN_CONTRACT,
    draft: {
      fidelityMode: 'guided',
      identity: { avatarAssetId: 'avatar', speechVoiceId: 'voice' },
      intent: { objective: 'Meet Brand' },
      output: { aspectRatio: '9:16', count: 1, kind: 'avatar' },
      references: [],
      reviewRequired: true,
      target: {
        kind: 'organic',
        platform: BrandRemixOrganicPlatform.INSTAGRAM,
      },
    },
    phase: 'prefilled',
    readiness: { issues: [], state: 'ready' },
    recipeVersion: 1,
    revision: 1,
    scenePipeline: {
      analysis: {
        durationSeconds: 10,
        keyframes: [],
        model: 'whisper',
        rewrite: { attempt: 1, state: 'ready' },
        sizeBytes: 1000,
        sourceAssetId: 'video',
        transcript: 'hello there friend',
        transcription: { attempt: 1, state: 'ready' },
        vendorCostKnown: false,
      },
      cancellationGeneration: 0,
      language: 'en',
      receipts: [],
      replacedAssetIds: [],
      scenes: {},
      state: 'storyboard',
      version: 1,
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
    version: 1,
  });
}

describe('BrandRemixSceneQuoteService avatar pricing', () => {
  const planning = { assertDraftAssetsAuthorized: vi.fn() };
  const source = { prepare: vi.fn() };
  const estimate = { estimate: vi.fn() };
  const byok = { isByokActiveForProvider: vi.fn() };
  const avatars = { quotePlatformCredits: vi.fn() };
  const service = new BrandRemixSceneQuoteService(
    planning as unknown as BrandRemixRunPlanningService,
    source as unknown as BrandRemixSceneSourceService,
    estimate as unknown as AgentGenerationEstimateService,
    byok as unknown as ByokService,
    avatars as unknown as AvatarVideoGenerationService,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    planning.assertDraftAssetsAuthorized.mockResolvedValue(undefined);
    source.prepare.mockResolvedValue(undefined);
    estimate.estimate.mockResolvedValue({
      credits: 2,
      isAvailable: true,
      modelKey: MODEL_KEYS.REPLICATE_GOOGLE_NANO_BANANA_2,
    });
  });

  it('returns a zero avatar quote for BYOK scenes without a platform price', async () => {
    byok.isByokActiveForProvider.mockImplementation(
      async (_organizationId: string, provider: ByokProvider) =>
        provider === ByokProvider.HEYGEN,
    );
    avatars.quotePlatformCredits.mockRejectedValue(
      new Error('PRICING_NOT_CONFIGURED'),
    );

    const quote = await service.build('org', 'brand', config(), {
      expectedRevision: 1,
      operation: 'generate',
    });

    const videos = quote.items.filter((item) => item.stage === 'video');
    expect(avatars.quotePlatformCredits).not.toHaveBeenCalled();
    expect(videos).toHaveLength(2);
    expect(videos).toEqual([
      expect.objectContaining({ billingMode: 'byok', credits: 0 }),
      expect.objectContaining({ billingMode: 'byok', credits: 0 }),
    ]);
  });

  it('quotes the platform avatar price once for every platform-billed scene', async () => {
    byok.isByokActiveForProvider.mockResolvedValue(false);
    avatars.quotePlatformCredits.mockResolvedValue(4);

    const quote = await service.build('org', 'brand', config(), {
      expectedRevision: 1,
      operation: 'generate',
    });

    expect(avatars.quotePlatformCredits).toHaveBeenCalledOnce();
    expect(quote.items.filter((item) => item.stage === 'video')).toEqual([
      expect.objectContaining({ billingMode: 'platform', credits: 4 }),
      expect.objectContaining({ billingMode: 'platform', credits: 4 }),
    ]);
  });
});
