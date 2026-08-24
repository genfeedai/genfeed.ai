import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compilePrunaaiPVideoGenerationBrief } from '@api/services/generation-brief/compile-prunaai-p-video-generation-brief';
import { GenerationBriefCompileError } from '@api/services/generation-brief/generation-brief-compile.error';
import { assertRedactedVideoGenerationBriefEvidence } from '@api/services/generation-brief/redact-generation-brief-evidence';
import { videoGenerationBriefSchema } from '@api-types/contracts/generation-brief.contract';
import { prunaaiPVideoDispatchSchema } from '@api-types/contracts/video-generation-brief-compiler.contract';
import { MODEL_KEYS } from '@genfeedai/constants';
import { describe, expect, it } from 'vitest';

const fixturesDir = join(
  dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'prunaai-p-video',
);

function readFixture(name: string): unknown {
  return JSON.parse(readFileSync(join(fixturesDir, name), 'utf8'));
}

describe('compilePrunaaiPVideoGenerationBrief', () => {
  it('locks the unbranded PrunaAI P-Video mapping and defaults', () => {
    const brief = videoGenerationBriefSchema.parse(
      readFixture('unbranded.input.json'),
    );
    const expectedDispatch = prunaaiPVideoDispatchSchema.parse(
      readFixture('unbranded.dispatch.json'),
    );

    const result = compilePrunaaiPVideoGenerationBrief({ brief });

    expect(result.dispatch).toEqual(expectedDispatch);
    expect(result.evidence.modelKey).toBe(MODEL_KEYS.REPLICATE_PRUNAAI_P_VIDEO);
    expect(result.evidence.compilerId).toBe('prunaai-p-video-compiler');
    expect(result.evidence.profileId).toBe('prunaai-p-video-capability');
    expect(assertRedactedVideoGenerationBriefEvidence(result.evidence)).toEqual(
      result.evidence,
    );
    expect(result.evidence).not.toHaveProperty('prompt');
    expect(result.evidence).not.toHaveProperty('dispatch');
  });

  it('locks the guided PrunaAI P-Video mapping, honors the first frame reference', () => {
    const brief = videoGenerationBriefSchema.parse(
      readFixture('guided.input.json'),
    );
    const expectedDispatch = prunaaiPVideoDispatchSchema.parse(
      readFixture('guided.dispatch.json'),
    );

    const result = compilePrunaaiPVideoGenerationBrief({ brief, seed: 42 });

    expect(result.dispatch).toEqual(expectedDispatch);
    expect(result.dispatch).not.toHaveProperty('negative_prompt');
    expect(result.evidence.omittedSignals).toEqual([
      {
        field: 'constraints.avoid',
        reason: 'PrunaAI P-Video has no native negative-prompt field.',
      },
    ]);
    expect(result.evidence.referenceAssetIds).toEqual(['asset_product_123']);
    expect(result.evidence.output.hasSeed).toBe(true);
    expect(result.evidence.output.durationSeconds).toBe(8);
    expect(JSON.stringify(result.evidence)).not.toContain(
      'Approved product first frame',
    );
    expect(assertRedactedVideoGenerationBriefEvidence(result.evidence)).toEqual(
      result.evidence,
    );
  });

  it('ignores avoid constraints when fidelity is off', () => {
    const brief = videoGenerationBriefSchema.parse({
      constraints: [
        { kind: 'avoid', required: false, value: 'busy backgrounds' },
      ],
      fidelityMode: 'off',
      intent: { objective: 'a drone shot flying over a canyon at sunrise' },
      mediaKind: 'video',
      output: { aspectRatio: '16:9' },
      version: 1,
    });

    const result = compilePrunaaiPVideoGenerationBrief({ brief });

    expect(result.dispatch.prompt).toBe(
      'a drone shot flying over a canyon at sunrise',
    );
    expect(result.evidence.omittedSignals).toEqual([]);
  });

  it('rejects strict required signals PrunaAI P-Video cannot honor', () => {
    const brief = videoGenerationBriefSchema.parse({
      constraints: [
        { kind: 'avoid', required: true, value: 'busy backgrounds' },
      ],
      fidelityMode: 'strict',
      intent: { objective: 'Bring the new bottle to life in a studio spin' },
      mediaKind: 'video',
      output: {},
      references: [
        { assetId: 'asset_product_123', role: 'first_frame' },
        { assetId: 'asset_end_456', role: 'last_frame' },
      ],
      version: 1,
    });

    expect(() => compilePrunaaiPVideoGenerationBrief({ brief })).toThrow(
      GenerationBriefCompileError,
    );
  });

  it('does not mutate the normalized brief', () => {
    const brief = videoGenerationBriefSchema.parse(
      readFixture('unbranded.input.json'),
    );
    const original = structuredClone(brief);

    compilePrunaaiPVideoGenerationBrief({ brief });

    expect(brief).toEqual(original);
  });
});
