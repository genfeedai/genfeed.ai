import { type BrandRemixRunConfig } from '@genfeedai/contracts/api-types/contracts/brand-remix-run.contract';
import { describe, expect, it } from 'vitest';
import {
  assertOriginalNarration,
  assertSceneBriefFidelity,
  assertScenePlan,
  assertSceneQuote,
  assertSupportedSceneFidelity,
  canResumeScenePipeline,
  initialScenePipeline,
  invalidateScenePipeline,
  isRetryableSyncSceneStage,
  sceneInputHash,
} from './brand-remix-scene-state';

function config(): BrandRemixRunConfig {
  return {
    contract: 'brand-remix-run',
    version: 1,
    recipeVersion: 1,
    revision: 1,
    phase: 'prefilled',
    readiness: { state: 'ready', issues: [] },
    draft: {
      fidelityMode: 'guided',
      identity: { avatarAssetId: 'avatar', speechVoiceId: 'voice' },
      intent: { objective: 'Original brand introduction' },
      references: [],
      reviewRequired: true,
      target: { kind: 'organic', platform: 'instagram' },
      output: { kind: 'avatar', count: 1, aspectRatio: '9:16' },
    },
    sourceSnapshot: {
      capturedAt: '2026-09-24T00:00:00.000Z',
      evidence: [],
      metrics: {},
      pattern: {},
      platform: 'instagram',
      selector: { kind: 'source_post', sourcePostId: 'source' },
      sourceId: 'source',
      title: 'Source',
    },
    concept: {
      savedAt: '2026-09-24T00:00:00.000Z',
      storyboard: ['a', 'b'].map((id, index) => ({
        id,
        ordinal: index + 1,
        durationSeconds: 5,
        narration: `Original scene ${id}`,
        visualIntent: `Brand visual ${id}`,
        sourceObservation: {
          sourceAssetId: 'source-video',
          startSeconds: index * 5,
          endSeconds: index * 5 + 5,
          keyframeSeconds: index * 5 + 2,
          semanticIntent: 'Reveal benefit',
          transcriptSlice: '',
        },
      })),
    },
    scenePipeline: {
      ...initialScenePipeline(),
      state: 'storyboard',
      analysis: {
        sourceAssetId: 'source-video',
        durationSeconds: 10,
        sizeBytes: 1000,
        model: 'analysis',
        transcription: { attempt: 1, state: 'ready' },
        rewrite: { attempt: 1, state: 'ready' },
        keyframes: [],
        vendorCostKnown: false,
      },
      scenes: Object.fromEntries(
        ['a', 'b'].map((id) => [
          id,
          {
            identity: { avatarAssetId: 'avatar', speechVoiceId: 'voice' },
            referenceAssetIds: [],
            image: { attempt: 1, state: 'ready', assetId: `${id}-image` },
            video: { attempt: 1, state: 'ready', assetId: `${id}-video` },
            replacedAssetIds: [],
          },
        ]),
      ),
    },
  } as BrandRemixRunConfig;
}
function conceptOf(value: BrandRemixRunConfig) {
  if (!value.concept) throw new Error('missing concept');
  return value.concept;
}
describe('scene contract invariants', () => {
  it('retains completed assets through output reorder and validates source timing separately', () => {
    const before = config();
    const next = structuredClone(before);
    conceptOf(next)
      .storyboard.reverse()
      .forEach((scene, index) => {
        scene.ordinal = index + 1;
      });
    expect(() => assertScenePlan(next)).not.toThrow();
    const pipeline = invalidateScenePipeline(before, next);
    expect(pipeline?.scenes.a.image.assetId).toBe('a-image');
    expect(pipeline?.scenes.a.video.assetId).toBe('a-video');
    expect(pipeline?.quote).toBeUndefined();
    expect(pipeline?.assembly).toBeUndefined();
  });
  it('invalidates only the edited narration clip even when aggregate script changes', () => {
    const before = config();
    const next = structuredClone(before);
    conceptOf(next).storyboard[0].narration = 'A new original line';
    next.draft.intent.objective = 'Aggregate changed script';
    const saved = invalidateScenePipeline(before, next);
    expect(saved?.scenes.a.image.assetId).toBe('a-image');
    expect(saved?.scenes.a.video.state).toBe('pending');
    expect(saved?.scenes.b.video.assetId).toBe('b-video');
  });
  it('invalidates still and clip for a visual edit while retaining other scenes', () => {
    const before = config();
    const next = structuredClone(before);
    conceptOf(next).storyboard[0].visualIntent = 'New product framing';
    const saved = invalidateScenePipeline(before, next);
    expect(saved?.scenes.a.image.state).toBe('pending');
    expect(saved?.scenes.a.replacedAssetIds).toEqual(['a-image', 'a-video']);
    expect(saved?.scenes.b.video.assetId).toBe('b-video');
  });
  it('rejects copied nine-word runs after punctuation and case normalization', () => {
    expect(() =>
      assertOriginalNarration(
        'One two three four five six seven eight nine.',
        'ONE, TWO three four five six seven eight nine',
      ),
    ).toThrow();
    expect(() =>
      assertOriginalNarration(
        'One two three four five six seven eight nine.',
        'One two three four five six seven eight fresh',
      ),
    ).not.toThrow();
  });
  it('rejects stale source attachments and expired quotes without dispatch', () => {
    const saved = config();
    const now = Date.now();
    const quote = {
      id: 'quote',
      revision: 1,
      operation: 'generate' as const,
      inputHash: sceneInputHash(saved),
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + 1000).toISOString(),
      total: 0,
      items: [],
    };
    expect(() => assertSceneQuote(saved, quote, now)).not.toThrow();
    expect(() => assertSceneQuote(saved, quote, now + 2000)).toThrow();
    saved.analysisSource = {
      assetId: 'replacement',
      assetUpdatedAt: new Date(now).toISOString(),
      selectedAt: new Date(now).toISOString(),
      selectedByUserId: 'user',
      selection: 'brand_library',
      purpose: 'analysis_only',
    };
    expect(() => assertSceneQuote(saved, quote, now)).toThrow();
  });
  it('rejects duplicate IDs, invalid duration, cross-source observations and missing identities', () => {
    for (const mutation of [
      (saved: BrandRemixRunConfig) => {
        conceptOf(saved).storyboard[1].id = 'a';
      },
      (saved: BrandRemixRunConfig) => {
        conceptOf(saved).storyboard[0].durationSeconds = 20;
      },
      (saved: BrandRemixRunConfig) => {
        const observation = conceptOf(saved).storyboard[0].sourceObservation;
        if (!observation) throw new Error('missing observation');
        observation.sourceAssetId = 'foreign';
      },
      (saved: BrandRemixRunConfig) => {
        saved.draft.identity = {};
      },
    ]) {
      const saved = config();
      mutation(saved);
      expect(() => assertScenePlan(saved)).toThrow();
    }
  });
  it('rejects strict fidelity so guided scene output cannot be labeled strict', () => {
    const saved = config();
    expect(() => assertSupportedSceneFidelity(saved)).not.toThrow();
    expect(() => assertSceneBriefFidelity('guided')).not.toThrow();
    saved.draft.fidelityMode = 'strict';
    expect(() => assertSupportedSceneFidelity(saved)).toThrow(
      /Strict fidelity/,
    );
    expect(() => assertSceneBriefFidelity('strict')).toThrow(/Strict fidelity/);
  });
  it('keeps an unanalyzed pipeline awaiting analysis after an edit', () => {
    const before = config();
    const pipeline = before.scenePipeline;
    if (!pipeline) throw new Error('missing pipeline');
    pipeline.analysis = undefined;
    pipeline.state = 'awaiting_analysis';
    const next = structuredClone(before);
    conceptOf(next).storyboard[0].narration = 'A new original line';
    expect(invalidateScenePipeline(before, next)?.state).toBe(
      'awaiting_analysis',
    );
  });
  it('retries synchronous platform stages only once no live step can hold them', () => {
    const now = Date.parse('2026-09-24T01:00:00.000Z');
    expect(
      isRetryableSyncSceneStage({ attempt: 1, state: 'uncertain' }, now),
    ).toBe(true);
    expect(
      isRetryableSyncSceneStage(
        { attempt: 1, state: 'claimed', claimedAt: '2026-09-24T00:59:30.000Z' },
        now,
      ),
    ).toBe(false);
    expect(
      isRetryableSyncSceneStage(
        { attempt: 1, state: 'claimed', claimedAt: '2026-09-24T00:50:00.000Z' },
        now,
      ),
    ).toBe(true);
    expect(
      isRetryableSyncSceneStage({ attempt: 1, state: 'failed' }, now),
    ).toBe(false);
  });
  it('resumes stopped operations and only stalled active chains', () => {
    const now = Date.parse('2026-09-24T01:00:00.000Z');
    const pipeline = {
      ...initialScenePipeline(),
      operation: {
        id: 'op',
        quoteId: 'quote',
        revision: 1,
        cancellationGeneration: 0,
        startedAt: '2026-09-24T00:00:00.000Z',
        userId: 'user',
        sequence: 0,
      },
    };
    const fresh = new Date(now - 30_000);
    const stale = new Date(now - 10 * 60_000);
    expect(
      canResumeScenePipeline({ ...pipeline, state: 'generating' }, fresh, now),
    ).toBe(false);
    expect(
      canResumeScenePipeline({ ...pipeline, state: 'generating' }, stale, now),
    ).toBe(true);
    expect(
      canResumeScenePipeline({ ...pipeline, state: 'cancelled' }, fresh, now),
    ).toBe(true);
    expect(
      canResumeScenePipeline({ ...pipeline, state: 'ready' }, stale, now),
    ).toBe(false);
  });
});
