import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileImagenGenerationBrief } from '@api/services/generation-brief/compile-imagen-generation-brief';
import { GenerationBriefCompileError } from '@api/services/generation-brief/generation-brief-compile.error';
import { assertRedactedGenerationBriefEvidence } from '@api/services/generation-brief/redact-generation-brief-evidence';
import { imageGenerationBriefSchema } from '@api-types/contracts/generation-brief.contract';
import { imagenDispatchSchema } from '@api-types/contracts/generation-brief-compiler.contract';
import { MODEL_KEYS } from '@genfeedai/constants';
import { describe, expect, it } from 'vitest';

const fixturesDir = join(
  dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'imagen',
);

function readFixture(name: string): unknown {
  return JSON.parse(readFileSync(join(fixturesDir, name), 'utf8'));
}

const IMAGEN_4_MODEL_KEY = MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_4;

describe('compileImagenGenerationBrief', () => {
  it('locks the unbranded Imagen mapping and defaults', () => {
    const brief = imageGenerationBriefSchema.parse(
      readFixture('unbranded.input.json'),
    );
    const expectedDispatch = imagenDispatchSchema.parse(
      readFixture('unbranded.dispatch.json'),
    );

    const result = compileImagenGenerationBrief({
      brief,
      modelKey: IMAGEN_4_MODEL_KEY,
    });

    expect(result.dispatch).toEqual(expectedDispatch);
    expect(result.evidence.modelKey).toBe(IMAGEN_4_MODEL_KEY);
    expect(result.evidence.compilerId).toBe('imagen-image-compiler');
    expect(result.evidence.profileId).toBe('imagen-4-capability');
    expect(assertRedactedGenerationBriefEvidence(result.evidence)).toEqual(
      result.evidence,
    );
    expect(result.evidence).not.toHaveProperty('prompt');
    expect(result.evidence).not.toHaveProperty('dispatch');
  });

  it('locks the guided Imagen mapping, omits unsupported negatives and references', () => {
    const brief = imageGenerationBriefSchema.parse(
      readFixture('guided.input.json'),
    );
    const expectedDispatch = imagenDispatchSchema.parse(
      readFixture('guided.dispatch.json'),
    );

    const result = compileImagenGenerationBrief({
      brief,
      modelKey: IMAGEN_4_MODEL_KEY,
    });

    expect(result.dispatch).toEqual(expectedDispatch);
    expect(result.evidence.omittedSignals).toEqual([
      {
        field: 'references',
        reason: 'Imagen has no native reference-image field.',
      },
      {
        field: 'constraints.avoid',
        reason: 'Imagen has no native negative-prompt field.',
      },
    ]);
    expect(result.evidence.referenceAssetIds).toEqual(['asset_product_123']);
    expect(result.evidence.output.hasSeed).toBe(false);
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

    const result = compileImagenGenerationBrief({
      brief,
      modelKey: IMAGEN_4_MODEL_KEY,
    });

    expect(result.dispatch.prompt).toBe('a sunset over the ocean');
    expect(result.evidence.omittedSignals).toEqual([]);
  });

  it('rejects strict required signals Imagen cannot honor', () => {
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

    expect(() =>
      compileImagenGenerationBrief({ brief, modelKey: IMAGEN_4_MODEL_KEY }),
    ).toThrow(GenerationBriefCompileError);
  });

  it('rejects an unregistered model key', () => {
    const brief = imageGenerationBriefSchema.parse({
      constraints: [],
      fidelityMode: 'off',
      intent: { objective: 'a sunset over the ocean' },
      mediaKind: 'image',
      output: {},
      version: 1,
    });

    expect(() =>
      compileImagenGenerationBrief({ brief, modelKey: 'google/imagen-9' }),
    ).toThrow(GenerationBriefCompileError);
  });

  it('does not mutate the normalized brief', () => {
    const brief = imageGenerationBriefSchema.parse(
      readFixture('unbranded.input.json'),
    );
    const original = structuredClone(brief);

    compileImagenGenerationBrief({ brief, modelKey: IMAGEN_4_MODEL_KEY });

    expect(brief).toEqual(original);
  });
});
