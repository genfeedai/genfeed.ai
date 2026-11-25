import { resolveBrandDefaultReferences } from '@api/collections/brands/utils/brand-default-references.util';
import { ReferenceImageCategory } from '@genfeedai/contracts';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import type { IBrandKitResolvedAssets } from '@genfeedai/contracts/interfaces';
import { describe, expect, it } from 'vitest';

const brandKit: IBrandKitResolvedAssets = {
  references: [
    {
      id: 'product-1',
      referenceCategory: ReferenceImageCategory.PRODUCT,
      role: 'reference',
      url: 'https://cdn.example.com/product-1',
    },
    {
      id: 'style-1',
      referenceCategory: ReferenceImageCategory.STYLE,
      role: 'reference',
      url: 'https://cdn.example.com/style-1',
    },
  ],
};

const MODEL_WITH_REFERENCES = MODEL_KEYS.FAL_NANO_BANANA_2;
const MODEL_WITHOUT_REFERENCES = MODEL_KEYS.FAL_SEEDREAM_5_5;

describe('resolveBrandDefaultReferences', () => {
  it('attaches the brand style then product references when the caller attached none', () => {
    const result = resolveBrandDefaultReferences({
      brandKit,
      explicitReferenceIds: [],
      modelKey: MODEL_WITH_REFERENCES,
    });

    expect(result.attachedAssetIds).toEqual(['style-1', 'product-1']);
    expect(result.references.map((reference) => reference.role)).toEqual([
      'style',
      'product',
    ]);
    expect(result.skippedReason).toBeUndefined();
  });

  it('adds nothing when the caller attached a reference', () => {
    expect(
      resolveBrandDefaultReferences({
        brandKit,
        explicitReferenceIds: ['own-1'],
        modelKey: MODEL_WITH_REFERENCES,
      }),
    ).toEqual({ attachedAssetIds: [], references: [] });
  });

  it('adds nothing when branding is off', () => {
    expect(
      resolveBrandDefaultReferences({
        brandKit,
        brandingMode: 'off',
        explicitReferenceIds: [],
        modelKey: MODEL_WITH_REFERENCES,
      }),
    ).toEqual({ attachedAssetIds: [], references: [] });
  });

  it('says so when the model accepts no references', () => {
    expect(
      resolveBrandDefaultReferences({
        brandKit,
        explicitReferenceIds: [],
        modelKey: MODEL_WITHOUT_REFERENCES,
      }),
    ).toEqual({
      attachedAssetIds: [],
      references: [],
      skippedReason: 'model_accepts_no_references',
    });
  });

  it('stays silent for a brand with no references', () => {
    expect(
      resolveBrandDefaultReferences({
        brandKit: { references: [] },
        explicitReferenceIds: [],
        modelKey: MODEL_WITHOUT_REFERENCES,
      }),
    ).toEqual({ attachedAssetIds: [], references: [] });
  });
});
