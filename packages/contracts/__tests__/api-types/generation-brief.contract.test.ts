import { describe, expect, test } from 'vitest';
import {
  generationBriefSchema,
  generationFidelityModeValues,
  generationFidelityPolicies,
  generationFidelityPolicySchema,
} from '../../src/api-types/contracts/generation-brief.contract';

describe('generation brief contract', () => {
  test('accepts a bounded versioned image brief with stable reference identities', () => {
    const brief = generationBriefSchema.parse({
      constraints: [
        {
          kind: 'exact_composition',
          required: true,
          value: 'Keep the product label readable.',
        },
      ],
      fidelityMode: 'strict',
      intent: {
        composition: 'Centered product portrait',
        objective: 'Create a launch image for the new bottle.',
        requestedText: ['NEW'],
        subjects: ['Reusable bottle'],
        visualDirection: 'Clean editorial product photography',
      },
      mediaKind: 'image',
      output: {
        aspectRatio: '4:5',
        height: 1_600,
        width: 1_280,
      },
      provenance: [
        {
          field: 'intent.visualDirection',
          source: 'brand',
        },
      ],
      references: [
        {
          assetId: 'asset_product_123',
          description: 'Approved product packshot',
          role: 'product',
        },
      ],
      version: 1,
    });

    expect(brief.mediaKind).toBe('image');
    expect(brief.references[0]?.assetId).toBe('asset_product_123');
    expect(brief.references[0]).not.toHaveProperty('url');
  });

  test('accepts first and last frame roles only for video briefs', () => {
    const videoBrief = generationBriefSchema.parse({
      fidelityMode: 'guided',
      intent: {
        motion: 'Slow push toward the product.',
        objective: 'Create a five-second product reveal.',
      },
      mediaKind: 'video',
      output: {
        aspectRatio: '9:16',
        durationSeconds: 5,
      },
      references: [
        { assetId: 'asset_first', role: 'first_frame' },
        { assetId: 'asset_last', role: 'last_frame' },
      ],
      version: 1,
    });

    expect(videoBrief.references.map((reference) => reference.role)).toEqual([
      'first_frame',
      'last_frame',
    ]);

    expect(() =>
      generationBriefSchema.parse({
        fidelityMode: 'guided',
        intent: { objective: 'Create a still image.' },
        mediaKind: 'image',
        output: {},
        references: [{ assetId: 'asset_first', role: 'first_frame' }],
        version: 1,
      }),
    ).toThrow();
  });

  test('keeps video resolution as first-class requested output', () => {
    const brief = generationBriefSchema.parse({
      fidelityMode: 'guided',
      intent: { objective: 'A cinematic reveal' },
      mediaKind: 'video',
      output: { resolution: '4k' },
      references: [],
      version: 1,
    });

    expect(brief.output.resolution).toBe('4k');
  });

  test('rejects unknown versions, modes, missing intent, and unbounded fields', () => {
    const validBrief = {
      fidelityMode: 'off',
      intent: { objective: 'Create an unbranded image.' },
      mediaKind: 'image',
      output: {},
      version: 1,
    };

    expect(generationBriefSchema.safeParse(validBrief).success).toBe(true);
    expect(
      generationBriefSchema.safeParse({ ...validBrief, version: 2 }).success,
    ).toBe(false);
    expect(
      generationBriefSchema.safeParse({
        ...validBrief,
        fidelityMode: 'automatic',
      }).success,
    ).toBe(false);
    expect(
      generationBriefSchema.safeParse({ ...validBrief, intent: {} }).success,
    ).toBe(false);
    expect(
      generationBriefSchema.safeParse({
        ...validBrief,
        providerPayload: { apiKey: 'must-not-enter-the-brief' },
      }).success,
    ).toBe(false);
  });

  test('requires output dimensions to be paired', () => {
    const result = generationBriefSchema.safeParse({
      fidelityMode: 'guided',
      intent: { objective: 'Create a square image.' },
      mediaKind: 'image',
      output: { width: 1_024 },
      version: 1,
    });

    expect(result.success).toBe(false);
  });

  test.each(['0:0', '0:1', '1:0', '10000:1', '1:10000'])(
    'rejects the invalid or unbounded aspect ratio %s',
    (aspectRatio) => {
      const result = generationBriefSchema.safeParse({
        fidelityMode: 'guided',
        intent: { objective: 'Create an image.' },
        mediaKind: 'image',
        output: { aspectRatio },
        version: 1,
      });

      expect(result.success).toBe(false);
    },
  );

  test('defines exhaustive deterministic Off, Guided, and Strict behavior', () => {
    expect(Object.keys(generationFidelityPolicies).sort()).toEqual(
      [...generationFidelityModeValues].sort(),
    );

    expect(generationFidelityPolicies.off).toEqual({
      applyConstraints: false,
      unsupportedConstraintBehavior: 'ignore',
    });
    expect(generationFidelityPolicies.guided).toEqual({
      applyConstraints: true,
      unsupportedConstraintBehavior: 'warn',
    });
    expect(generationFidelityPolicies.strict).toEqual({
      applyConstraints: true,
      unsupportedConstraintBehavior: 'reject',
    });

    for (const policy of Object.values(generationFidelityPolicies)) {
      expect(generationFidelityPolicySchema.parse(policy)).toEqual(policy);
    }
  });
});
