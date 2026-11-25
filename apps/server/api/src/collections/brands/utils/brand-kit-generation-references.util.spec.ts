import { toBrandGenerationReferences } from '@api/collections/brands/utils/brand-kit-generation-references.util';
import { ReferenceImageCategory } from '@genfeedai/contracts';
import type { IBrandKitResolvedAssets } from '@genfeedai/contracts/interfaces';
import { describe, expect, it } from 'vitest';

const brandKit: IBrandKitResolvedAssets = {
  references: [
    {
      id: 'face-1',
      label: 'Product photo with misleading words',
      referenceCategory: ReferenceImageCategory.FACE,
      role: 'reference',
      url: 'https://cdn.example.com/references/face-1',
    },
    {
      id: 'logo-1',
      referenceCategory: ReferenceImageCategory.LOGO,
      role: 'reference',
      url: 'https://cdn.example.com/references/logo-1',
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
    {
      id: 'style-1',
      referenceCategory: ReferenceImageCategory.STYLE,
      role: 'reference',
      url: 'https://cdn.example.com/references/style-1',
    },
  ],
};

describe('toBrandGenerationReferences', () => {
  it('lists style, then product, and never a face or a logo by default', () => {
    const references = toBrandGenerationReferences(brandKit);

    expect(references).toEqual([
      expect.objectContaining({ assetId: 'legacy-1', role: 'style' }),
      expect.objectContaining({ assetId: 'style-1', role: 'style' }),
      expect.objectContaining({
        assetId: 'product-1',
        description: 'Matte black bottle with gold cap',
        role: 'product',
      }),
    ]);
    expect(Object.isFrozen(references)).toBe(true);
    expect(references.every(Object.isFrozen)).toBe(true);
  });

  it('adds a face last when the caller opts in, and still never a logo', () => {
    const references = toBrandGenerationReferences(brandKit, {
      includeFaces: true,
    });

    expect(references.map((reference) => reference.assetId)).toEqual([
      'legacy-1',
      'style-1',
      'product-1',
      'face-1',
    ]);
    expect(references.at(-1)?.role).toBe('character');
  });

  it('skips assets the caller already attached and honours the limit', () => {
    const references = toBrandGenerationReferences(brandKit, {
      excludeAssetIds: ['legacy-1'],
      limit: 1,
    });

    expect(references.map((reference) => reference.assetId)).toEqual([
      'style-1',
    ]);
  });
});
