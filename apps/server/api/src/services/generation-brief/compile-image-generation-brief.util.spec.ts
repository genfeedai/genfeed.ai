import {
  buildImageGenerationBriefAppliedFields,
  buildImageGenerationBriefPrompt,
  fitBrandContextToPromptBudget,
} from '@api/services/generation-brief/compile-image-generation-brief.util';
import {
  generationFidelityPolicies,
  imageGenerationBriefSchema,
} from '@genfeedai/contracts/api-types/contracts/generation-brief.contract';
import { describe, expect, it } from 'vitest';

function buildBrief(overrides: {
  brandContext?: string;
  fidelityMode?: 'off' | 'guided' | 'strict';
}) {
  return imageGenerationBriefSchema.parse({
    constraints: [],
    fidelityMode: overrides.fidelityMode ?? 'off',
    intent: {
      ...(overrides.brandContext
        ? { brandContext: overrides.brandContext }
        : {}),
      objective: 'a sunset over the ocean',
    },
    mediaKind: 'image',
    output: {},
    version: 1,
  });
}

/**
 * `buildImageGenerationBriefPrompt` backs 13 of 15 image compiler families
 * (the rest — FLUX Schnell, MiniMax H3 — inline the same logic). One spec
 * here is the single highest-leverage proof that Brand voice reaches
 * brief-compiled models (#4676 FR1).
 */
describe('buildImageGenerationBriefPrompt brandContext (#4676)', () => {
  it('appends brandContext to the prompt when present', () => {
    const result = buildImageGenerationBriefPrompt({
      brief: buildBrief({ brandContext: 'Warm, confident, editorial voice.' }),
      maxCharacters: 10_000,
      modelLabel: 'Test Model',
      omitted: [],
      policy: generationFidelityPolicies.off,
      supportsNegativePrompt: false,
    });

    // `joinGenerationBriefPromptParts` strips each part's trailing period
    // before rejoining with '. ' — expected, existing behavior.
    expect(result.prompt).toBe(
      'a sunset over the ocean. Warm, confident, editorial voice',
    );
  });

  it('is unaffected by fidelity policy — brand voice never depends on avoid-forced guided mode', () => {
    const guided = buildImageGenerationBriefPrompt({
      brief: buildBrief({
        brandContext: 'Warm, confident, editorial voice.',
        fidelityMode: 'guided',
      }),
      maxCharacters: 10_000,
      modelLabel: 'Test Model',
      omitted: [],
      policy: generationFidelityPolicies.guided,
      supportsNegativePrompt: false,
    });
    const off = buildImageGenerationBriefPrompt({
      brief: buildBrief({ brandContext: 'Warm, confident, editorial voice.' }),
      maxCharacters: 10_000,
      modelLabel: 'Test Model',
      omitted: [],
      policy: generationFidelityPolicies.off,
      supportsNegativePrompt: false,
    });

    expect(guided.prompt).toBe(off.prompt);
  });

  it('omits brandContext from the prompt when absent', () => {
    const result = buildImageGenerationBriefPrompt({
      brief: buildBrief({}),
      maxCharacters: 10_000,
      modelLabel: 'Test Model',
      omitted: [],
      policy: generationFidelityPolicies.off,
      supportsNegativePrompt: false,
    });

    expect(result.prompt).toBe('a sunset over the ocean');
  });

  it('trims brand voice to fit the remaining budget instead of failing the whole compile (#4676)', () => {
    const omitted: Array<{ field: string; reason: string }> = [];
    const result = buildImageGenerationBriefPrompt({
      brief: buildBrief({
        brandContext: 'x'.repeat(50),
      }),
      // "a sunset over the ocean" is 24 chars; leave room for only part of
      // the 50-char brand text after the ". " separator.
      maxCharacters: 24 + 2 + 10,
      modelLabel: 'Test Model',
      omitted,
      policy: generationFidelityPolicies.off,
      supportsNegativePrompt: false,
    });

    expect(result.prompt.length).toBeLessThanOrEqual(24 + 2 + 10);
    expect(result.prompt).toContain('a sunset over the ocean');
    expect(result.prompt).toContain('…');
    expect(omitted).toContainEqual(
      expect.objectContaining({ field: 'intent.brandContext' }),
    );
  });

  it('drops brand voice entirely, recording it, when there is no room at all', () => {
    const omitted: Array<{ field: string; reason: string }> = [];
    const result = buildImageGenerationBriefPrompt({
      brief: buildBrief({ brandContext: 'Warm, confident, editorial voice.' }),
      // Exactly enough room for the objective and nothing else.
      maxCharacters: 'a sunset over the ocean'.length,
      modelLabel: 'Test Model',
      omitted,
      policy: generationFidelityPolicies.off,
      supportsNegativePrompt: false,
    });

    expect(result.prompt).toBe('a sunset over the ocean');
    expect(omitted).toContainEqual(
      expect.objectContaining({ field: 'intent.brandContext' }),
    );
  });
});

describe('fitBrandContextToPromptBudget', () => {
  it('returns the full text when it fits', () => {
    const omitted: Array<{ field: string; reason: string }> = [];
    expect(
      fitBrandContextToPromptBudget({
        brandContext: 'short',
        maxCharacters: 100,
        modelLabel: 'Test Model',
        omitted,
        otherPartsLength: 10,
      }),
    ).toBe('short');
    expect(omitted).toHaveLength(0);
  });

  it('returns undefined and records nothing when there is no brand context', () => {
    const omitted: Array<{ field: string; reason: string }> = [];
    expect(
      fitBrandContextToPromptBudget({
        maxCharacters: 100,
        modelLabel: 'Test Model',
        omitted,
        otherPartsLength: 10,
      }),
    ).toBeUndefined();
    expect(omitted).toHaveLength(0);
  });
});

describe('buildImageGenerationBriefAppliedFields brandContext (#4676)', () => {
  it('records intent.brandContext only when present', () => {
    expect(
      buildImageGenerationBriefAppliedFields({
        appliedConstraintFields: [],
        brief: buildBrief({ brandContext: 'Warm voice' }),
        hasSeed: false,
      }),
    ).toContain('intent.brandContext');

    expect(
      buildImageGenerationBriefAppliedFields({
        appliedConstraintFields: [],
        brief: buildBrief({}),
        hasSeed: false,
      }),
    ).not.toContain('intent.brandContext');
  });
});
