import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileFluxSchnellGenerationBrief } from '@api/services/generation-brief/compile-flux-schnell-generation-brief';
import { GenerationBriefCompileError } from '@api/services/generation-brief/generation-brief-compile.error';
import { assertRedactedGenerationBriefEvidence } from '@api/services/generation-brief/redact-generation-brief-evidence';
import { imageGenerationBriefSchema } from '@genfeedai/contracts/api-types/contracts/generation-brief.contract';
import { fluxSchnellDispatchSchema } from '@genfeedai/contracts/api-types/contracts/generation-brief-compiler.contract';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import { describe, expect, it } from 'vitest';

const fixturesDir = join(
  dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'flux-schnell',
);

function readFixture(name: string): unknown {
  return JSON.parse(readFileSync(join(fixturesDir, name), 'utf8'));
}

describe('compileFluxSchnellGenerationBrief', () => {
  it('locks the unbranded FLUX Schnell mapping and defaults', () => {
    const brief = imageGenerationBriefSchema.parse(
      readFixture('unbranded.input.json'),
    );
    const expectedDispatch = fluxSchnellDispatchSchema.parse(
      readFixture('unbranded.dispatch.json'),
    );

    const result = compileFluxSchnellGenerationBrief({ brief });

    expect(result.dispatch).toEqual(expectedDispatch);
    expect(result.evidence.modelKey).toBe(
      MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_SCHNELL,
    );
    expect(result.evidence.compilerId).toBe('flux-schnell-image-compiler');
    expect(result.evidence.profileId).toBe('flux-schnell-capability');
    expect(assertRedactedGenerationBriefEvidence(result.evidence)).toEqual(
      result.evidence,
    );
    expect(result.evidence).not.toHaveProperty('prompt');
    expect(result.evidence).not.toHaveProperty('dispatch');
  });

  it('locks the guided FLUX Schnell mapping, omits unsupported negatives and references', () => {
    const brief = imageGenerationBriefSchema.parse(
      readFixture('guided.input.json'),
    );
    const expectedDispatch = fluxSchnellDispatchSchema.parse(
      readFixture('guided.dispatch.json'),
    );

    const result = compileFluxSchnellGenerationBrief({
      brief,
      seed: 42,
    });

    expect(result.dispatch).toEqual(expectedDispatch);
    expect(result.dispatch).not.toHaveProperty('negative_prompt');
    expect(result.evidence.omittedSignals).toEqual([
      {
        field: 'references',
        reason: 'FLUX Schnell has no native reference-image field.',
      },
      {
        field: 'constraints.avoid',
        reason: 'FLUX Schnell has no native negative-prompt field.',
      },
    ]);
    expect(result.evidence.referenceAssetIds).toEqual(['asset_product_123']);
    expect(result.evidence.output.hasSeed).toBe(true);
    expect(JSON.stringify(result.evidence)).not.toContain(
      'Approved product packshot',
    );
    expect(assertRedactedGenerationBriefEvidence(result.evidence)).toEqual(
      result.evidence,
    );
  });

  it('ignores avoid constraints when fidelity is off', () => {
    const brief = imageGenerationBriefSchema.parse({
      constraints: [
        { kind: 'avoid', required: false, value: 'busy backgrounds' },
      ],
      fidelityMode: 'off',
      intent: { objective: 'a sunset over the ocean' },
      mediaKind: 'image',
      output: { aspectRatio: '16:9' },
      version: 1,
    });

    const result = compileFluxSchnellGenerationBrief({ brief });

    expect(result.dispatch.prompt).toBe('a sunset over the ocean');
    expect(result.evidence.omittedSignals).toEqual([]);
  });

  it('rejects strict required signals FLUX Schnell cannot honor', () => {
    const brief = imageGenerationBriefSchema.parse({
      constraints: [
        { kind: 'avoid', required: true, value: 'busy backgrounds' },
      ],
      fidelityMode: 'strict',
      intent: { objective: 'Create a launch image for the new bottle' },
      mediaKind: 'image',
      output: {},
      references: [{ assetId: 'asset_product_123', role: 'product' }],
      version: 1,
    });

    expect(() => compileFluxSchnellGenerationBrief({ brief })).toThrow(
      GenerationBriefCompileError,
    );
  });

  it('does not mutate the normalized brief', () => {
    const brief = imageGenerationBriefSchema.parse(
      readFixture('unbranded.input.json'),
    );
    const original = structuredClone(brief);

    compileFluxSchnellGenerationBrief({ brief });

    expect(brief).toEqual(original);
  });
});
