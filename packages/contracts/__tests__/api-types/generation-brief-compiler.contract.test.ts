import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { imageGenerationBriefSchema } from '../../src/api-types/contracts/generation-brief.contract';
import {
  buildFluxSchnellGenerationSource,
  buildGenerationBriefExemptionSource,
  fluxSchnellDispatchSchema,
  generationBriefCompileEvidenceSchema,
  generationBriefExemptionEvidenceSchema,
  generationBriefPersistedEvidenceSchema,
  generationBriefSupportSchema,
  generationBriefSurfaceSchema,
  generationBriefSurfaceValues,
} from '../../src/api-types/contracts/generation-brief-compiler.contract';
import { FLUX_SCHNELL_MODEL_KEY } from '../../src/api-types/contracts/generation-capability-profile.contract';

const fixturesDir = join(
  dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'flux-schnell',
);

function readFixture(name: string): unknown {
  return JSON.parse(readFileSync(join(fixturesDir, name), 'utf8'));
}

describe('generation brief compiler contract', () => {
  test('accepts FLUX Schnell compile support and exempts every other model', () => {
    expect(
      generationBriefSupportSchema.parse({
        compilerId: 'flux-schnell-image-compiler',
        compilerVersion: 1,
        kind: 'compile',
        modelKey: FLUX_SCHNELL_MODEL_KEY,
        profileId: 'flux-schnell-capability',
        profileVersion: 1,
      }).kind,
    ).toBe('compile');

    expect(
      generationBriefSupportSchema.parse({
        compilerId: null,
        kind: 'exempt',
        modelKey: 'google/imagen-4',
        profileId: null,
        reason: 'legacy_prompt_builder',
      }),
    ).toEqual({
      compilerId: null,
      kind: 'exempt',
      modelKey: 'google/imagen-4',
      profileId: null,
      reason: 'legacy_prompt_builder',
    });
  });

  test('locks the unbranded FLUX Schnell brief golden fixture', () => {
    const brief = imageGenerationBriefSchema.parse(
      readFixture('unbranded.input.json'),
    );

    expect(brief.intent.objective).toBe('a sunset over the ocean');
    expect(brief.output.aspectRatio).toBe('16:9');
    expect(brief.fidelityMode).toBe('off');
  });

  test('locks the unbranded FLUX Schnell dispatch golden fixture', () => {
    const dispatch = fluxSchnellDispatchSchema.parse(
      readFixture('unbranded.dispatch.json'),
    );

    expect(dispatch).toEqual({
      aspect_ratio: '16:9',
      disable_safety_checker: false,
      go_fast: true,
      num_inference_steps: 4,
      num_outputs: 1,
      output_format: 'jpg',
      output_quality: 80,
      prompt: 'a sunset over the ocean',
    });
  });

  test('locks the guided FLUX Schnell dispatch golden fixture', () => {
    const dispatch = fluxSchnellDispatchSchema.parse(
      readFixture('guided.dispatch.json'),
    );

    expect(dispatch.aspect_ratio).toBe('1:1');
    expect(dispatch.seed).toBe(42);
    expect(dispatch.prompt).toContain('Visible text: NEW');
    expect(dispatch.prompt).not.toContain('busy backgrounds');
    expect(dispatch).not.toHaveProperty('negative_prompt');
    expect(dispatch).not.toHaveProperty('image');
    expect(dispatch).not.toHaveProperty('input_image');
  });

  test('redacted compile evidence records identity without prompt secrets', () => {
    const evidence = generationBriefCompileEvidenceSchema.parse({
      appliedFields: ['intent.objective', 'output.aspectRatio'],
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
      referenceAssetIds: [],
      status: 'compiled',
    });

    expect(evidence).not.toHaveProperty('prompt');
    expect(JSON.stringify(evidence)).not.toMatch(/sunset|api[_-]?key|sk-/i);
    expect(buildFluxSchnellGenerationSource()).toBe(
      'generation-brief:v1:flux-schnell-capability@1:flux-schnell-image-compiler@1',
    );
  });

  test('exemption evidence never claims compiler or profile identity', () => {
    const evidence = generationBriefExemptionEvidenceSchema.parse({
      compilerId: null,
      compilerVersion: null,
      modelKey: 'google/imagen-4',
      profileId: null,
      profileVersion: null,
      reason: 'legacy_prompt_builder',
      status: 'exempted',
    });

    expect(generationBriefPersistedEvidenceSchema.parse(evidence).status).toBe(
      'exempted',
    );
    expect(buildGenerationBriefExemptionSource('legacy_prompt_builder')).toBe(
      'generation-brief-exemption:legacy_prompt_builder',
    );
  });

  test('enumerates every originating surface (#3469)', () => {
    expect(generationBriefSurfaceValues).toEqual([
      'studio',
      'workflow',
      'agent_skill',
      'telegram_bot',
      'schedule',
    ]);
    for (const surface of generationBriefSurfaceValues) {
      expect(generationBriefSurfaceSchema.parse(surface)).toBe(surface);
    }
    expect(() => generationBriefSurfaceSchema.parse('mcp')).toThrow();
  });

  test('compile evidence records the originating surface when provided (#3469)', () => {
    const withSurface = generationBriefCompileEvidenceSchema.parse({
      appliedFields: ['intent.objective', 'output.aspectRatio'],
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
      referenceAssetIds: [],
      status: 'compiled',
      surface: 'workflow',
    });
    expect(withSurface.surface).toBe('workflow');

    const withoutSurface = generationBriefCompileEvidenceSchema.parse({
      appliedFields: ['intent.objective', 'output.aspectRatio'],
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
      referenceAssetIds: [],
      status: 'compiled',
    });
    expect(withoutSurface.surface).toBeUndefined();

    expect(() =>
      generationBriefCompileEvidenceSchema.parse({
        appliedFields: [],
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
        referenceAssetIds: [],
        status: 'compiled',
        surface: 'mcp',
      }),
    ).toThrow();
  });

  test('exemption evidence records the originating surface when provided (#3469)', () => {
    const withSurface = generationBriefExemptionEvidenceSchema.parse({
      compilerId: null,
      compilerVersion: null,
      modelKey: 'google/imagen-4',
      profileId: null,
      profileVersion: null,
      reason: 'legacy_prompt_builder',
      status: 'exempted',
      surface: 'agent_skill',
    });
    expect(withSurface.surface).toBe('agent_skill');
  });
});
