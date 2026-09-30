import { IngredientCategory } from '@genfeedai/contracts';
import { describe, expect, it } from 'vitest';
import {
  categoriesFromAssetTypeIds,
  getLibraryAssetType,
  getLibraryAssetTypeLabel,
  LIBRARY_ASSET_TYPES,
  selectedAssetTypeIds,
} from './library-asset-type.util';

describe('LIBRARY_ASSET_TYPES', () => {
  it('never lists the same category twice', () => {
    const all = LIBRARY_ASSET_TYPES.flatMap((type) => [...type.categories]);

    expect(all).toEqual(Array.from(new Set(all)));
  });

  it('uses singular title-case labels for the filter and the pill', () => {
    expect(LIBRARY_ASSET_TYPES.map((type) => type.label)).toEqual([
      'Image',
      'Video',
      'GIF',
      'Avatar',
      'Audio',
      'Voice',
      'Text',
    ]);
  });
});

describe('getLibraryAssetType', () => {
  it('maps VIDEO and VIDEO_EDIT to the same Video type and color', () => {
    const video = getLibraryAssetType(IngredientCategory.VIDEO);
    const videoEdit = getLibraryAssetType(IngredientCategory.VIDEO_EDIT);

    expect(video).toEqual(videoEdit);
    expect(video?.label).toBe('Video');
    expect(video?.badgeVariant).toBe('video');
  });

  it('maps IMAGE and IMAGE_EDIT to Image', () => {
    expect(getLibraryAssetTypeLabel(IngredientCategory.IMAGE)).toBe('Image');
    expect(getLibraryAssetTypeLabel(IngredientCategory.IMAGE_EDIT)).toBe(
      'Image',
    );
  });
});

describe('type-id round trip', () => {
  it('expands selected type ids into every category in the group', () => {
    expect(categoriesFromAssetTypeIds(['video', 'image'])).toEqual([
      IngredientCategory.IMAGE,
      IngredientCategory.IMAGE_EDIT,
      IngredientCategory.VIDEO,
      IngredientCategory.VIDEO_EDIT,
    ]);
  });

  it('selects a type only when every category in the group is present', () => {
    expect(selectedAssetTypeIds([IngredientCategory.VIDEO])).toEqual([]);
    expect(
      selectedAssetTypeIds([
        IngredientCategory.VIDEO,
        IngredientCategory.VIDEO_EDIT,
      ]),
    ).toEqual(['video']);
  });
});
