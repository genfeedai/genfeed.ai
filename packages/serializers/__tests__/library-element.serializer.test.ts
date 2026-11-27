import { LibraryElementSerializer } from '@serializers/server/content/library-element.serializer';
import { describe, expect, it } from 'vitest';

describe('LibraryElementSerializer', () => {
  it('exposes the element facts and ordered reference files, never an unlisted field', () => {
    const output = LibraryElementSerializer.serialize({
      availabilityMode: 'OWNING_BRAND',
      availableBrandIds: [],
      description: 'Sunlit corner loft',
      handle: 'loft-studio',
      id: 'element-1',
      internalNote: 'hidden',
      isDeleted: false,
      label: 'Loft studio',
      owningBrandId: 'brand-1',
      referenceIngredientIds: ['asset-1', 'asset-2'],
      type: 'LOCATION',
    }) as {
      data: { attributes: Record<string, unknown>; type: string };
    };

    expect(output.data.type).toBe('library-element');
    expect(output.data.attributes).toMatchObject({
      description: 'Sunlit corner loft',
      handle: 'loft-studio',
      label: 'Loft studio',
      referenceIngredientIds: ['asset-1', 'asset-2'],
      type: 'LOCATION',
    });
    expect(output.data.attributes).not.toHaveProperty('internalNote');
  });
});
