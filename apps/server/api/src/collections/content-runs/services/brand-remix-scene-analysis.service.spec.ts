import type { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import type { OpenRouterService } from '@api/services/integrations/openrouter/services/openrouter.service';
import type { WhisperService } from '@api/services/whisper/whisper.service';
import {
  BRAND_REMIX_RUN_CONTRACT,
  brandRemixRunConfigSchema,
} from '@genfeedai/contracts/api-types/contracts/brand-remix-run.contract';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrandRemixRunPlanningService } from './brand-remix-run-planning.service';
import { BrandRemixSceneAnalysisService } from './brand-remix-scene-analysis.service';
import type { BrandRemixSceneBillingService } from './brand-remix-scene-billing.service';
import type { BrandRemixSceneSourceService } from './brand-remix-scene-source.service';
import type { BrandRemixSceneStoreService } from './brand-remix-scene-store.service';

vi.mock(
  '@api/collections/content-runs/services/brand-remix-run-planning.service',
  () => ({ BrandRemixRunPlanningService: class {} }),
);
vi.mock(
  '@api/collections/content-runs/services/brand-remix-scene-billing.service',
  () => ({ BrandRemixSceneBillingService: class {} }),
);
vi.mock(
  '@api/collections/content-runs/services/brand-remix-scene-source.service',
  () => ({ BrandRemixSceneSourceService: class {} }),
);
vi.mock(
  '@api/collections/content-runs/services/brand-remix-scene-store.service',
  () => ({ BrandRemixSceneStoreService: class {} }),
);
vi.mock('@api/services/files-microservice/client/files-client.service', () => ({
  FilesClientService: class {},
}));
vi.mock(
  '@api/services/integrations/openrouter/services/openrouter.service',
  () => ({ OpenRouterService: class {} }),
);
vi.mock('@api/services/whisper/whisper.service', () => ({
  WhisperService: class {},
}));

type AnalysisStage = {
  attempt: number;
  state: 'pending' | 'claimed' | 'uncertain' | 'failed' | 'ready';
  claimedAt?: string;
};
function fixture(transcription: AnalysisStage, rewrite: AnalysisStage) {
  return brandRemixRunConfigSchema.parse({
    contract: BRAND_REMIX_RUN_CONTRACT,
    version: 1,
    recipeVersion: 1,
    revision: 1,
    phase: 'generating',
    readiness: { state: 'ready', issues: [] },
    draft: {
      fidelityMode: 'guided',
      identity: { avatarAssetId: 'avatar', speechVoiceId: 'voice' },
      intent: { objective: 'Brand' },
      output: { kind: 'avatar', count: 1, aspectRatio: '9:16' },
      references: [],
      reviewRequired: true,
      target: { kind: 'organic', platform: 'instagram' },
    },
    sourceSnapshot: {
      capturedAt: '2026-09-24T00:00:00.000Z',
      evidence: [],
      metrics: {},
      pattern: {},
      platform: 'instagram',
      selector: { kind: 'source_post', sourcePostId: 'source' },
      sourceId: 'source',
      title: 'Imported',
    },
    scenePipeline: {
      version: 1,
      language: 'en',
      state: 'analysing',
      cancellationGeneration: 0,
      replacedAssetIds: [],
      receipts: [],
      scenes: {},
      operation: {
        id: 'op',
        quoteId: 'quote',
        revision: 1,
        cancellationGeneration: 0,
        startedAt: '2026-09-24T00:00:00.000Z',
        userId: 'user',
        sequence: 0,
      },
      quote: {
        id: 'quote',
        revision: 1,
        operation: 'analysis',
        inputHash: 'hash',
        createdAt: '2026-09-24T00:00:00.000Z',
        expiresAt: '2026-09-24T00:15:00.000Z',
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
      },
      analysis: {
        sourceAssetId: 'video',
        durationSeconds: 12,
        sizeBytes: 1000,
        model: 'semantic',
        transcription,
        rewrite,
        keyframes: [],
        vendorCostKnown: false,
      },
    },
  });
}

describe('scene analysis recovery', () => {
  let config = fixture(
    { attempt: 1, state: 'pending' },
    { attempt: 1, state: 'pending' },
  );
  /**
   * What crossed each boundary in order: credit ledger entries, transcription
   * requests, and the fence options each step ran under.
   */
  let ledger: string[];
  let transcriptions: string[];
  let fences: unknown[];
  let service: BrandRemixSceneAnalysisService;

  beforeEach(() => {
    ledger = [];
    transcriptions = [];
    fences = [];
    const store = {
      fence: async (
        _org: string,
        _run: string,
        _op: string,
        options: unknown,
      ) => {
        fences.push(options);
        return { brandId: 'brand', config };
      },
      read: async () => ({ brandId: 'brand', config }),
      save: async (
        _org: string,
        _run: string,
        _previous: unknown,
        next: unknown,
      ) => {
        config = brandRemixRunConfigSchema.parse(next);
      },
    };
    const source = {
      prepare: async () => ({
        durationSeconds: 12,
        sizeBytes: 1000,
        sourceAssetId: 'video',
        url: 'https://cdn.test/video.mp4',
      }),
    };
    const billing = {
      release: async (
        _o: string,
        _r: string,
        _op: string,
        line: { key: string },
      ) => {
        ledger.push(`release:${line.key}`);
      },
      reserve: async (
        _o: string,
        _r: string,
        _op: string,
        line: { key: string },
      ) => {
        ledger.push(`reserve:${line.key}`);
      },
      settle: async (
        _o: string,
        _r: string,
        _op: string,
        line: { key: string },
      ) => {
        ledger.push(`settle:${line.key}`);
      },
    };
    const whisper = {
      transcribeUrl: async (url: string) => {
        transcriptions.push(url);
        return {
          language: 'en',
          srt: '1\n00:00:00,000 --> 00:00:01,000\nOriginal',
          text: 'Original source words',
        };
      },
    };
    service = new BrandRemixSceneAnalysisService(
      {} as BrandRemixRunPlanningService,
      store as unknown as BrandRemixSceneStoreService,
      source as unknown as BrandRemixSceneSourceService,
      billing as unknown as BrandRemixSceneBillingService,
      whisper as unknown as WhisperService,
      {} as FilesClientService,
      {} as OpenRouterService,
    );
  });

  it('reruns an uncertain transcription under the same accepted line and keeps the paid transcript', async () => {
    config = fixture(
      { attempt: 1, state: 'uncertain' },
      { attempt: 1, state: 'pending' },
    );

    await expect(service.step('org', 'run', 'op')).resolves.toBe(false);

    expect(ledger).toEqual([
      'reserve:run-transcription-1',
      'settle:run-transcription-1',
    ]);
    expect(transcriptions).toEqual(['https://cdn.test/video.mp4']);
    expect(fences).toContainEqual({ allowCancelled: true });
    expect(config.scenePipeline?.analysis?.transcription.state).toBe('ready');
    expect(config.scenePipeline?.analysis?.transcript).toBe(
      'Original source words',
    );
  });

  it('waits on a live claim instead of calling the platform twice', async () => {
    config = fixture(
      {
        attempt: 1,
        state: 'claimed',
        claimedAt: new Date().toISOString(),
      },
      { attempt: 1, state: 'pending' },
    );

    await expect(service.step('org', 'run', 'op')).rejects.toThrow(
      'still running',
    );
    expect(transcriptions).toEqual([]);
    expect(ledger).toEqual([]);
  });

  it('requires a new quote after a definitively failed analysis', async () => {
    config = fixture(
      { attempt: 1, state: 'ready' },
      { attempt: 1, state: 'failed' },
    );

    await expect(service.step('org', 'run', 'op')).rejects.toThrow(
      'new analysis quote',
    );
    expect(ledger).toEqual([]);
  });
});
