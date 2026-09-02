import { toBrandKitAssetRelations } from '@api/collections/brands/utils/brand-kit-asset-relations.util';
import { ReferenceImageCategory } from '@genfeedai/contracts';
import type { IBrandKitResolvedAssets } from '@genfeedai/contracts/interfaces';
import { describe, expect, it } from 'vitest';

describe('toBrandKitAssetRelations', () => {
  it('maps a resolved kit onto the serializer asset shape', () => {
    const resolved: IBrandKitResolvedAssets = {
      banner: {
        id: 'asset-banner',
        mimeType: 'image/jpeg',
        role: 'banner',
        url: 'https://cdn.example.com/banners/asset-banner',
      },
      logo: {
        id: 'asset-logo',
        label: 'Wordmark',
        mimeType: 'image/png',
        role: 'logo',
        url: 'https://cdn.example.com/logos/asset-logo',
      },
      references: [
        {
          id: 'asset-ref',
          referenceCategory: ReferenceImageCategory.PRODUCT,
          role: 'reference',
          url: 'https://cdn.example.com/references/asset-ref',
        },
      ],
    };

    expect(toBrandKitAssetRelations(resolved)).toEqual({
      banner: {
        category: 'BANNER',
        cdnUrl: 'https://cdn.example.com/banners/asset-banner',
        displayName: undefined,
        id: 'asset-banner',
        mimeType: 'image/jpeg',
      },
      logo: {
        category: 'LOGO',
        cdnUrl: 'https://cdn.example.com/logos/asset-logo',
        displayName: 'Wordmark',
        id: 'asset-logo',
        mimeType: 'image/png',
      },
      references: [
        {
          category: 'REFERENCE',
          cdnUrl: 'https://cdn.example.com/references/asset-ref',
          displayName: undefined,
          id: 'asset-ref',
          mimeType: undefined,
          referenceCategory: 'PRODUCT',
        },
      ],
    });
  });

  it('leaves logo and banner absent when the brand has neither', () => {
    const relations = toBrandKitAssetRelations({ references: [] });

    expect(relations.logo).toBeUndefined();
    expect(relations.banner).toBeUndefined();
    expect(relations.references).toEqual([]);
  });
});
