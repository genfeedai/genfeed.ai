import {
  assertRedactedGenerationBriefEvidence,
  assertRedactedVideoGenerationBriefEvidence,
} from '@api/services/generation-brief/redact-generation-brief-evidence';
import { FLUX_SCHNELL_MODEL_KEY } from '@genfeedai/contracts/api-types/contracts/generation-capability-profile.contract';
import {
  PRUNAAI_P_VIDEO_COMPILER_ID,
  VIDEO_GENERATION_BRIEF_CONTRACT_VERSION,
} from '@genfeedai/contracts/api-types/contracts/video-generation-brief-compiler.contract';
import { PRUNAAI_P_VIDEO_MODEL_KEY } from '@genfeedai/contracts/api-types/contracts/video-generation-capability-profile.contract';
import { describe, expect, it } from 'vitest';

describe('assertRedactedGenerationBriefEvidence', () => {
  it('accepts compiler identity without prompt or credential fields', () => {
    expect(
      assertRedactedGenerationBriefEvidence({
        appliedFields: ['intent.objective'],
        briefVersion: 1,
        compilerId: 'flux-schnell-image-compiler',
        compilerVersion: 1,
        fidelityMode: 'off',
        mediaKind: 'image',
        modelKey: FLUX_SCHNELL_MODEL_KEY,
        omittedSignals: [],
        output: {
          aspectRatio: '16:9',
          hasSeed: false,
          numOutputs: 1,
          outputFormat: 'jpg',
        },
        profileId: 'flux-schnell-capability',
        profileVersion: 1,
        referenceAssetIds: ['asset_product_123'],
        status: 'compiled',
      }),
    ).toMatchObject({
      compilerId: 'flux-schnell-image-compiler',
      status: 'compiled',
    });
  });

  it('rejects evidence that still carries a signed URL', () => {
    expect(() =>
      assertRedactedGenerationBriefEvidence({
        appliedFields: ['intent.objective'],
        briefVersion: 1,
        compilerId: 'flux-schnell-image-compiler',
        compilerVersion: 1,
        fidelityMode: 'off',
        mediaKind: 'image',
        modelKey: FLUX_SCHNELL_MODEL_KEY,
        omittedSignals: [],
        output: {
          aspectRatio: '16:9',
          hasSeed: false,
          numOutputs: 1,
          outputFormat: 'jpg',
        },
        profileId: 'flux-schnell-capability',
        profileVersion: 1,
        referenceAssetIds: ['https://cdn.example.com/secret.png?token=abc'],
        status: 'compiled',
      }),
    ).toThrow(/prompt secrets/);
  });
});

describe('assertRedactedVideoGenerationBriefEvidence', () => {
  it('accepts compiler identity without prompt or credential fields', () => {
    expect(
      assertRedactedVideoGenerationBriefEvidence({
        appliedFields: ['intent.objective'],
        briefVersion: VIDEO_GENERATION_BRIEF_CONTRACT_VERSION,
        compilerId: PRUNAAI_P_VIDEO_COMPILER_ID,
        compilerVersion: 1,
        fidelityMode: 'off',
        mediaKind: 'video',
        modelKey: PRUNAAI_P_VIDEO_MODEL_KEY,
        omittedSignals: [],
        output: {
          aspectRatio: '16:9',
          durationSeconds: 5,
          hasSeed: false,
        },
        profileId: 'prunaai-p-video-capability',
        profileVersion: 1,
        referenceAssetIds: ['asset_product_123'],
        status: 'compiled',
      }),
    ).toMatchObject({
      compilerId: PRUNAAI_P_VIDEO_COMPILER_ID,
      status: 'compiled',
    });
  });

  it('rejects video evidence that still carries a signed URL', () => {
    expect(() =>
      assertRedactedVideoGenerationBriefEvidence({
        appliedFields: ['intent.objective'],
        briefVersion: VIDEO_GENERATION_BRIEF_CONTRACT_VERSION,
        compilerId: PRUNAAI_P_VIDEO_COMPILER_ID,
        compilerVersion: 1,
        fidelityMode: 'off',
        mediaKind: 'video',
        modelKey: PRUNAAI_P_VIDEO_MODEL_KEY,
        omittedSignals: [],
        output: {
          aspectRatio: '16:9',
          durationSeconds: 5,
          hasSeed: false,
        },
        profileId: 'prunaai-p-video-capability',
        profileVersion: 1,
        referenceAssetIds: ['https://cdn.example.com/secret.png?token=abc'],
        status: 'compiled',
      }),
    ).toThrow(/prompt secrets/);
  });
});
