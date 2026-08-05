import { IngredientFilterUtil } from '@api/helpers/utils/ingredient-filter/ingredient-filter.util';

describe('IngredientFilterUtil', () => {
  describe('buildParentFilter', () => {
    it('should filter root ingredients when parent is null', () => {
      const result = IngredientFilterUtil.buildParentFilter(null);
      expect(result).toEqual({ parentId: null });
    });

    it('should filter root ingredients when parent is "null" string', () => {
      const result = IngredientFilterUtil.buildParentFilter('null');
      expect(result).toEqual({ parentId: null });
    });

    it('should filter by parent ID when a valid entity ID is provided', () => {
      const parentId = '550e8400-e29b-41d4-a716-446655440001';
      const result = IngredientFilterUtil.buildParentFilter(parentId);
      expect(result).toEqual({ parentId });
    });

    it('should return empty object when parent is undefined (shows both parents and children)', () => {
      const result = IngredientFilterUtil.buildParentFilter(undefined);
      expect(result).toEqual({});
    });
  });

  describe('buildFolderFilter', () => {
    it('should not filter folders when folder is undefined (All Assets)', () => {
      const result = IngredientFilterUtil.buildFolderFilter(undefined);
      expect(result).toEqual({});
    });

    it('should filter by folder ID when a valid entity ID is provided', () => {
      const folderId = '550e8400-e29b-41d4-a716-446655440002';
      const result = IngredientFilterUtil.buildFolderFilter(folderId);
      expect(result).toEqual({ folderId });
    });

    it('should filter root level when folder is null', () => {
      const result = IngredientFilterUtil.buildFolderFilter(null);
      expect(result).toEqual({ folderId: null });
    });
  });

  describe('buildTrainingFilter', () => {
    it('should exclude training ingredients by default', () => {
      const result = IngredientFilterUtil.buildTrainingFilter(undefined);
      expect(result).toEqual({ trainingId: null });
    });

    it('should filter by training ID when a valid entity ID is provided', () => {
      const trainingId = '550e8400-e29b-41d4-a716-446655440003';
      const result = IngredientFilterUtil.buildTrainingFilter(trainingId);
      expect(result).toEqual({ trainingId });
    });

    it('should exclude training when invalid ID provided', () => {
      const result = IngredientFilterUtil.buildTrainingFilter('invalid');
      expect(result).toEqual({ trainingId: null });
    });
  });
});
