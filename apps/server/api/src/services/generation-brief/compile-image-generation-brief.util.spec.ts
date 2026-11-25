import {
  buildImageGenerationBriefReferenceLabels,
  recordUnsupportedImageGenerationBriefReferenceRoles,
  selectImageGenerationBriefReferencesByRole,
} from '@api/services/generation-brief/compile-image-generation-brief.util';
import { GenerationBriefCompileError } from '@api/services/generation-brief/generation-brief-compile.error';
import {
  generationFidelityPolicies,
  imageGenerationBriefSchema,
} from '@genfeedai/contracts/api-types/contracts/generation-brief.contract';
import type { GenerationBriefOmittedSignal } from '@genfeedai/contracts/api-types/contracts/generation-brief-compiler.contract';
import { describe, expect, it } from 'vitest';

function briefWith(
  references: Array<{ assetId: string; role: string }>,
  fidelityMode: 'guided' | 'strict' = 'guided',
) {
  return imageGenerationBriefSchema.parse({
    constraints: [],
    fidelityMode,
    intent: { objective: 'A flat white', requestedText: [], subjects: [] },
    mediaKind: 'image',
    output: { aspectRatio: '1:1' },
    provenance: [],
    references,
    version: 1,
  });
}

const labelledReferences = {
  max: 3,
  nativeFields: ['image_input'],
  promptLabelRoles: ['product', 'style'] as ('product' | 'style')[],
  roles: ['subject', 'product', 'style'] as ('subject' | 'product' | 'style')[],
};

describe('selectImageGenerationBriefReferencesByRole', () => {
  it('orders subject and product before style and keeps the brief order inside a tier', () => {
    const result = selectImageGenerationBriefReferencesByRole(
      briefWith([
        { assetId: 'style_explicit', role: 'style' },
        { assetId: 'style_brand', role: 'style' },
        { assetId: 'product_1', role: 'product' },
      ]),
      labelledReferences,
    );

    expect(result.included.map((reference) => reference.assetId)).toEqual([
      'product_1',
      'style_explicit',
      'style_brand',
    ]);
    expect(result.excludedCount).toBe(0);
  });

  it('drops a role the model cannot take and reports it apart from the excess', () => {
    const result = selectImageGenerationBriefReferencesByRole(
      briefWith([
        { assetId: 'comp_1', role: 'composition' },
        { assetId: 'style_1', role: 'style' },
      ]),
      labelledReferences,
    );

    expect(result.included.map((reference) => reference.assetId)).toEqual([
      'style_1',
    ]);
    expect(result.unsupportedRoles).toEqual(['composition']);
    expect(result.excludedCount).toBe(0);
  });

  it('counts references past the slot limit as excess after the order is applied', () => {
    const result = selectImageGenerationBriefReferencesByRole(
      briefWith([
        { assetId: 's1', role: 'style' },
        { assetId: 's2', role: 'style' },
        { assetId: 's3', role: 'style' },
        { assetId: 'p1', role: 'product' },
      ]),
      labelledReferences,
    );

    expect(result.included.map((reference) => reference.assetId)).toEqual([
      'p1',
      's1',
      's2',
    ]);
    expect(result.excludedCount).toBe(1);
  });
});

describe('buildImageGenerationBriefReferenceLabels', () => {
  it('writes one line per labelled reference by position', () => {
    const { included } = selectImageGenerationBriefReferencesByRole(
      briefWith([
        { assetId: 'style_1', role: 'style' },
        { assetId: 'subject_1', role: 'subject' },
        { assetId: 'product_1', role: 'product' },
      ]),
      labelledReferences,
    );

    expect(
      buildImageGenerationBriefReferenceLabels(included, labelledReferences),
    ).toEqual([
      'Image 2 is the product: keep it exactly',
      'Image 3 is a style reference: match its palette, texture and lighting, not its subject',
    ]);
  });

  it('writes nothing for a model whose profile names no label roles', () => {
    const { included } = selectImageGenerationBriefReferencesByRole(
      briefWith([{ assetId: 'product_1', role: 'product' }]),
      { ...labelledReferences, promptLabelRoles: undefined },
    );

    expect(
      buildImageGenerationBriefReferenceLabels(included, {
        ...labelledReferences,
        promptLabelRoles: undefined,
      }),
    ).toEqual([]);
  });
});

describe('recordUnsupportedImageGenerationBriefReferenceRoles', () => {
  it('records each unsupported role once with its count', () => {
    const omitted: GenerationBriefOmittedSignal[] = [];

    recordUnsupportedImageGenerationBriefReferenceRoles(
      omitted,
      ['composition', 'composition'],
      generationFidelityPolicies.guided,
      'guided',
      'Test Model',
    );

    expect(omitted).toEqual([
      {
        field: 'references',
        reason:
          'Test Model cannot take a composition reference; 2 reference(s) were omitted.',
      },
    ]);
  });

  it('rejects a strict brief when the model cannot take the role', () => {
    expect(() =>
      recordUnsupportedImageGenerationBriefReferenceRoles(
        [],
        ['composition'],
        generationFidelityPolicies.strict,
        'strict',
        'Test Model',
      ),
    ).toThrow(GenerationBriefCompileError);
  });
});
