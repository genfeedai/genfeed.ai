import { toBrandGenerationReferences } from '@api/collections/brands/utils/brand-kit-generation-references.util';
import { ReferenceImageCategory } from '@genfeedai/contracts';
import { describe, expect, it } from 'vitest';

describe('toBrandGenerationReferences', () => {
  it('maps typed categories without consulting display names', () => {
    const references = toBrandGenerationReferences({
      references: [
        {
          id: 'face-1',
          label: 'Product photo with misleading words',
          referenceCategory: ReferenceImageCategory.FACE,
          role: 'reference',
          url: 'https://cdn.example.com/references/face-1',
        },
        {
          id: 'product-1',
          label: 'Matte black bottle with gold cap',
          referenceCategory: ReferenceImageCategory.PRODUCT,
          role: 'reference',
          url: 'https://cdn.example.com/references/product-1',
        },
        {
          id: 'legacy-1',
          label: 'Character portrait',
          role: 'reference',
          url: 'https://cdn.example.com/references/legacy-1',
        },
      ],
    });

    expect(references).toEqual([
      expect.objectContaining({ assetId: 'face-1', role: 'character' }),
      expect.objectContaining({
        assetId: 'product-1',
        description: 'Matte black bottle with gold cap',
        role: 'product',
      }),
      expect.objectContaining({ assetId: 'legacy-1', role: 'style' }),
    ]);
    expect(Object.isFrozen(references)).toBe(true);
    expect(references.every(Object.isFrozen)).toBe(true);
  });
});
