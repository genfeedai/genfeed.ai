import { assembleImageGenerationBrief } from '@api/services/generation-brief/assemble-image-generation-brief';
import { resolveImageGenerationFidelityMode } from '@api/services/generation-brief/resolve-image-generation-fidelity-mode';
import { describe, expect, it } from 'vitest';

describe('assembleImageGenerationBrief', () => {
  it('preserves semantic run references instead of collapsing them to subjects', () => {
    const brief = assembleImageGenerationBrief({
      fidelityMode: 'guided',
      objective: 'Create a product scene',
      references: [
        { assetId: 'character-sheet', role: 'character' },
        {
          assetId: 'product-still',
          description: 'Matte black bottle with gold cap',
          role: 'product',
        },
      ],
    });

    expect(brief.references).toEqual([
      { assetId: 'character-sheet', role: 'character' },
      {
        assetId: 'product-still',
        description: 'Matte black bottle with gold cap',
        role: 'product',
      },
    ]);
  });

  it('normalizes an unbranded image request into a versioned brief', () => {
    const brief = assembleImageGenerationBrief({
      fidelityMode: resolveImageGenerationFidelityMode({}),
      height: 1080,
      objective: 'a sunset over the ocean',
      width: 1920,
    });

    expect(brief).toMatchObject({
      fidelityMode: 'off',
      intent: { objective: 'a sunset over the ocean' },
      mediaKind: 'image',
      output: { aspectRatio: '16:9', height: 1080, width: 1920 },
      version: 1,
    });
    expect(brief.references).toEqual([]);
  });

  it('records stable reference identities without signed URLs', () => {
    const brief = assembleImageGenerationBrief({
      fidelityMode: 'guided',
      objective: 'Create a launch image for the new bottle',
      referenceIds: ['asset_product_123'],
      visualDirection: 'Clean editorial product photography',
      visualDirectionSource: 'brand',
    });

    expect(brief.references).toEqual([
      { assetId: 'asset_product_123', role: 'subject' },
    ]);
    expect(brief.references[0]).not.toHaveProperty('url');
    expect(brief.provenance).toContainEqual({
      field: 'intent.visualDirection',
      source: 'brand',
    });
  });
});
