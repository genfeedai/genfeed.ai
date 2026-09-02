import { describe, expect, test } from 'vitest';
import {
  buildMinimaxH3GenerationSource,
  buildPrunaaiPVideoGenerationSource,
  buildVideoGenerationBriefExemptionSource,
  minimaxH3CompileEvidenceSchema,
  prunaaiPVideoCompileEvidenceSchema,
  videoGenerationBriefExemptionEvidenceSchema,
  videoGenerationBriefPersistedEvidenceSchema,
  videoGenerationBriefSupportSchema,
  videoGenerationBriefSurfaceSchema,
} from '../../src/api-types/contracts/video-generation-brief-compiler.contract';
import {
  MINIMAX_H3_CAPABILITY_PROFILE_ID,
  MINIMAX_H3_CAPABILITY_PROFILE_VERSION,
  MINIMAX_H3_MODEL_KEY,
  PRUNAAI_P_VIDEO_CAPABILITY_PROFILE_ID,
  PRUNAAI_P_VIDEO_CAPABILITY_PROFILE_VERSION,
  PRUNAAI_P_VIDEO_MODEL_KEY,
} from '../../src/api-types/contracts/video-generation-capability-profile.contract';

describe('video generation brief compiler contract', () => {
  test('accepts PrunaAI P-Video and MiniMax H3 compile support and exempts every other model', () => {
    expect(
      videoGenerationBriefSupportSchema.parse({
        compilerId: 'prunaai-p-video-compiler',
        compilerVersion: 1,
        kind: 'compile',
        modelKey: PRUNAAI_P_VIDEO_MODEL_KEY,
        profileId: PRUNAAI_P_VIDEO_CAPABILITY_PROFILE_ID,
        profileVersion: PRUNAAI_P_VIDEO_CAPABILITY_PROFILE_VERSION,
      }).kind,
    ).toBe('compile');

    expect(
      videoGenerationBriefSupportSchema.parse({
        compilerId: 'minimax-h3-compiler',
        compilerVersion: 2,
        kind: 'compile',
        modelKey: MINIMAX_H3_MODEL_KEY,
        profileId: MINIMAX_H3_CAPABILITY_PROFILE_ID,
        profileVersion: MINIMAX_H3_CAPABILITY_PROFILE_VERSION,
      }).kind,
    ).toBe('compile');

    expect(
      videoGenerationBriefSupportSchema.parse({
        compilerId: null,
        kind: 'exempt',
        modelKey: 'legacy/video-model',
        profileId: null,
        reason: 'legacy_prompt_builder',
      }),
    ).toEqual({
      compilerId: null,
      kind: 'exempt',
      modelKey: 'legacy/video-model',
      profileId: null,
      reason: 'legacy_prompt_builder',
    });
  });

  test('redacted PrunaAI P-Video compile evidence records identity without prompt secrets', () => {
    const evidence = prunaaiPVideoCompileEvidenceSchema.parse({
      appliedFields: ['intent.objective', 'output.aspectRatio'],
      briefVersion: 1,
      compilerId: 'prunaai-p-video-compiler',
      compilerVersion: 1,
      fidelityMode: 'off',
      mediaKind: 'video',
      modelKey: PRUNAAI_P_VIDEO_MODEL_KEY,
      omittedSignals: [],
      output: { aspectRatio: '16:9', durationSeconds: 5, hasSeed: false },
      profileId: PRUNAAI_P_VIDEO_CAPABILITY_PROFILE_ID,
      profileVersion: PRUNAAI_P_VIDEO_CAPABILITY_PROFILE_VERSION,
      referenceAssetIds: [],
      status: 'compiled',
    });

    expect(evidence).not.toHaveProperty('prompt');
    expect(JSON.stringify(evidence)).not.toMatch(/api[_-]?key|sk-/i);
    expect(buildPrunaaiPVideoGenerationSource()).toBe(
      `generation-brief:v1:${PRUNAAI_P_VIDEO_CAPABILITY_PROFILE_ID}@${PRUNAAI_P_VIDEO_CAPABILITY_PROFILE_VERSION}:prunaai-p-video-compiler@1`,
    );
  });

  test('redacted MiniMax H3 compile evidence records identity without prompt secrets', () => {
    const evidence = minimaxH3CompileEvidenceSchema.parse({
      appliedFields: ['intent.objective', 'output.aspectRatio'],
      briefVersion: 1,
      compilerId: 'minimax-h3-compiler',
      compilerVersion: 2,
      fidelityMode: 'off',
      mediaKind: 'video',
      modelKey: MINIMAX_H3_MODEL_KEY,
      omittedSignals: [],
      output: { aspectRatio: '16:9', durationSeconds: 5, hasSeed: false },
      profileId: MINIMAX_H3_CAPABILITY_PROFILE_ID,
      profileVersion: MINIMAX_H3_CAPABILITY_PROFILE_VERSION,
      referenceAssetIds: [],
      status: 'compiled',
    });

    expect(evidence).not.toHaveProperty('prompt');
    expect(buildMinimaxH3GenerationSource()).toBe(
      `generation-brief:v1:${MINIMAX_H3_CAPABILITY_PROFILE_ID}@${MINIMAX_H3_CAPABILITY_PROFILE_VERSION}:minimax-h3-compiler@2`,
    );
  });

  test('exemption evidence never claims compiler or profile identity', () => {
    const evidence = videoGenerationBriefExemptionEvidenceSchema.parse({
      compilerId: null,
      compilerVersion: null,
      modelKey: 'legacy/video-model',
      profileId: null,
      profileVersion: null,
      reason: 'legacy_prompt_builder',
      status: 'exempted',
    });

    expect(
      videoGenerationBriefPersistedEvidenceSchema.parse(evidence).status,
    ).toBe('exempted');
    expect(
      buildVideoGenerationBriefExemptionSource('legacy_prompt_builder'),
    ).toBe('generation-brief-exemption:legacy_prompt_builder');
  });

  test('re-exports the shared originating-surface enum (#3469)', () => {
    expect(videoGenerationBriefSurfaceSchema.parse('telegram_bot')).toBe(
      'telegram_bot',
    );
    expect(() => videoGenerationBriefSurfaceSchema.parse('mcp')).toThrow();
  });

  test('compile evidence records the originating surface when provided (#3469)', () => {
    const evidence = prunaaiPVideoCompileEvidenceSchema.parse({
      appliedFields: ['intent.objective', 'output.aspectRatio'],
      briefVersion: 1,
      compilerId: 'prunaai-p-video-compiler',
      compilerVersion: 1,
      fidelityMode: 'off',
      mediaKind: 'video',
      modelKey: PRUNAAI_P_VIDEO_MODEL_KEY,
      omittedSignals: [],
      output: { aspectRatio: '16:9', durationSeconds: 5, hasSeed: false },
      profileId: PRUNAAI_P_VIDEO_CAPABILITY_PROFILE_ID,
      profileVersion: PRUNAAI_P_VIDEO_CAPABILITY_PROFILE_VERSION,
      referenceAssetIds: [],
      status: 'compiled',
      surface: 'telegram_bot',
    });
    expect(evidence.surface).toBe('telegram_bot');
  });

  test('exemption evidence records the originating surface when provided (#3469)', () => {
    const evidence = videoGenerationBriefExemptionEvidenceSchema.parse({
      compilerId: null,
      compilerVersion: null,
      modelKey: 'legacy/video-model',
      profileId: null,
      profileVersion: null,
      reason: 'legacy_prompt_builder',
      status: 'exempted',
      surface: 'studio',
    });
    expect(evidence.surface).toBe('studio');
  });
});
