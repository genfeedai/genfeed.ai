import { IngredientFilterUtil } from '@api/helpers/utils/ingredient-filter/ingredient-filter.util';

describe('IngredientFilterUtil', () => {
  describe('buildParentFilter', () => {
    it('should filter root ingredients when parent is null', () => {
      const result = IngredientFilterUtil.buildParentFilter(null);
      expect(result).toEqual({ parentId: null });
    });

    it('should filter by parent ID when a valid entity ID is provided', () => {
      const parentId = '550e8400-e29b-41d4-a716-446655440001';
      const result = IngredientFilterUtil.buildParentFilter(parentId);
      expect(result).toEqual({ parentId });
    });
  });

  describe('buildFolderFilter', () => {
    it('should filter root level when folder is null', () => {
      const result = IngredientFilterUtil.buildFolderFilter(null);
      expect(result).toEqual({ folderId: null });
    });
  });

  describe('buildTrainingFilter', () => {
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
