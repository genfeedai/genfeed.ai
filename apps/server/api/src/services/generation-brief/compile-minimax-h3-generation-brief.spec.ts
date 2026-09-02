import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileMinimaxH3GenerationBrief } from '@api/services/generation-brief/compile-minimax-h3-generation-brief';
import { GenerationBriefCompileError } from '@api/services/generation-brief/generation-brief-compile.error';
import { assertRedactedVideoGenerationBriefEvidence } from '@api/services/generation-brief/redact-generation-brief-evidence';
import { videoGenerationBriefSchema } from '@genfeedai/contracts/api-types/contracts/generation-brief.contract';
import { minimaxH3DispatchSchema } from '@genfeedai/contracts/api-types/contracts/video-generation-brief-compiler.contract';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import { describe, expect, it } from 'vitest';

const fixturesDir = join(
  dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'minimax-h3',
);

function readFixture(name: string): unknown {
  return JSON.parse(readFileSync(join(fixturesDir, name), 'utf8'));
}

describe('compileMinimaxH3GenerationBrief', () => {
  it('locks the unbranded MiniMax H3 mapping and defaults', () => {
    const brief = videoGenerationBriefSchema.parse(
      readFixture('unbranded.input.json'),
    );
    const expectedDispatch = minimaxH3DispatchSchema.parse(
      readFixture('unbranded.dispatch.json'),
    );

    const result = compileMinimaxH3GenerationBrief({ brief });

    expect(result.dispatch).toEqual(expectedDispatch);
    expect(result.evidence.modelKey).toBe(MODEL_KEYS.REPLICATE_MINIMAX_H3);
    expect(result.evidence.compilerId).toBe('minimax-h3-compiler');
    expect(result.evidence.profileId).toBe('minimax-h3-capability');
    expect(assertRedactedVideoGenerationBriefEvidence(result.evidence)).toEqual(
      result.evidence,
    );
    expect(result.evidence).not.toHaveProperty('prompt');
    expect(result.evidence).not.toHaveProperty('dispatch');
  });

  it('locks the guided MiniMax H3 mapping: first/last frame, additional reference, adaptive ratio, and an omitted seed', () => {
    const brief = videoGenerationBriefSchema.parse(
      readFixture('guided.input.json'),
    );
    const expectedDispatch = minimaxH3DispatchSchema.parse(
      readFixture('guided.dispatch.json'),
    );

    const result = compileMinimaxH3GenerationBrief({ brief, seed: 99 });

    expect(result.dispatch).toEqual(expectedDispatch);
    expect(result.dispatch.ratio).toBe('adaptive');
    expect(result.dispatch).not.toHaveProperty('seed');
    expect(result.dispatch).not.toHaveProperty('negative_prompt');
    expect(result.evidence.output.aspectRatio).toBe('9:16');
    expect(result.evidence.output.hasSeed).toBe(false);
    expect(result.evidence.omittedSignals).toEqual([
      {
        field: 'constraints.avoid',
        reason: 'MiniMax H3 has no native negative-prompt field.',
      },
      {
        field: 'seed',
        reason: 'MiniMax H3 has no native seed field.',
      },
    ]);
    expect(result.evidence.referenceAssetIds).toEqual([
      'asset_product_123',
      'asset_logo_789',
      'asset_end_456',
    ]);
    expect(JSON.stringify(result.evidence)).not.toContain('Opening frame');
    expect(assertRedactedVideoGenerationBriefEvidence(result.evidence)).toEqual(
      result.evidence,
    );
  });

  it('ignores avoid constraints when fidelity is off', () => {
    const brief = videoGenerationBriefSchema.parse({
      constraints: [{ kind: 'avoid', required: false, value: 'motion blur' }],
      fidelityMode: 'off',
      intent: { objective: 'a neon skyline timelapse at dusk' },
      mediaKind: 'video',
      output: { aspectRatio: '16:9' },
      version: 1,
    });

    const result = compileMinimaxH3GenerationBrief({ brief });

    expect(result.dispatch.prompt).toBe('a neon skyline timelapse at dusk');
    expect(result.evidence.omittedSignals).toEqual([]);
  });

  it('honors the requested MiniMax H3 resolution', () => {
    const brief = videoGenerationBriefSchema.parse({
      constraints: [],
      fidelityMode: 'off',
      intent: { objective: 'a neon skyline timelapse at dusk' },
      mediaKind: 'video',
      output: { aspectRatio: '16:9', resolution: '2K' },
      version: 1,
    });

    const result = compileMinimaxH3GenerationBrief({ brief });

    expect(result.dispatch.resolution).toBe('2K');
    expect(result.evidence.output.resolution).toBe('2K');
  });

  it('dispatches native video references separately from image references', () => {
    const brief = videoGenerationBriefSchema.parse({
      constraints: [],
      fidelityMode: 'guided',
      intent: { objective: 'Continue the reference clip' },
      mediaKind: 'video',
      output: {},
      references: [
        { assetId: 'frame-image', role: 'first_frame' },
        { assetId: 'source-video', role: 'reference_video' },
      ],
      version: 1,
    });

    const result = compileMinimaxH3GenerationBrief({ brief });

    expect(result.dispatch.reference_image_urls).toEqual([]);
    expect(result.dispatch.reference_video_urls).toEqual(['source-video']);
  });

  it('rejects a last frame without its required first frame', () => {
    const brief = videoGenerationBriefSchema.parse({
      constraints: [],
      fidelityMode: 'guided',
      intent: { objective: 'arrive at the final composition' },
      mediaKind: 'video',
      output: {},
      references: [{ assetId: 'end-frame-1', role: 'last_frame' }],
      version: 1,
    });

    expect(() => compileMinimaxH3GenerationBrief({ brief })).toThrow(
      'requires a first-frame reference',
    );
  });

  it('rejects more than the three published reference videos', () => {
    const brief = videoGenerationBriefSchema.parse({
      constraints: [],
      fidelityMode: 'guided',
      intent: { objective: 'Continue the movement references' },
      mediaKind: 'video',
      output: {},
      references: Array.from({ length: 4 }, (_, index) => ({
        assetId: `source-video-${index + 1}`,
        role: 'reference_video' as const,
      })),
      version: 1,
    });

    expect(() => compileMinimaxH3GenerationBrief({ brief })).toThrow(
      'at most 3 video references',
    );
  });

  it('rejects strict required signals beyond MiniMax H3 reference capacity', () => {
    const brief = videoGenerationBriefSchema.parse({
      constraints: [],
      fidelityMode: 'strict',
      intent: { objective: 'Animate the product spin into a campaign clip' },
      mediaKind: 'video',
      output: {},
      references: [
        { assetId: 'asset_first', role: 'first_frame' },
        { assetId: 'asset_last', role: 'last_frame' },
        ...Array.from({ length: 9 }, (_, index) => ({
          assetId: `asset_extra_${index}`,
          role: 'subject' as const,
        })),
        { assetId: 'asset_overflow', role: 'subject' as const },
      ],
      version: 1,
    });

    expect(() => compileMinimaxH3GenerationBrief({ brief })).toThrow(
      GenerationBriefCompileError,
    );
  });

  it('does not mutate the normalized brief', () => {
    const brief = videoGenerationBriefSchema.parse(
      readFixture('unbranded.input.json'),
    );
    const original = structuredClone(brief);

    compileMinimaxH3GenerationBrief({ brief });

    expect(brief).toEqual(original);
  });
});
