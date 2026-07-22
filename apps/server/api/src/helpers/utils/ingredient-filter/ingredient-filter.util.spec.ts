import { IngredientFilterUtil } from '@api/helpers/utils/ingredient-filter/ingredient-filter.util';

describe('IngredientFilterUtil', () => {
  describe('buildParentFilter', () => {
    it('should filter root ingredients when parent is null', () => {
      const result = IngredientFilterUtil.buildParentFilter(null);
      expect(result).toEqual({ parent: null });
    });

    it('should filter root ingredients when parent is "null" string', () => {
      const result = IngredientFilterUtil.buildParentFilter('null');
      expect(result).toEqual({ parent: null });
    });

    it('should filter by parent ID when valid ObjectId provided', () => {
      const parentId = '507f191e810c19729de860ee';
      const result = IngredientFilterUtil.buildParentFilter(parentId);
      expect(result).toEqual({ parent: parentId });
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

    it('should filter by folder ID when valid ObjectId provided', () => {
      const folderId = '507f191e810c19729de860ee';
      const result = IngredientFilterUtil.buildFolderFilter(folderId);
      expect(result).toEqual({ folder: folderId });
    });

    it('should filter root level when folder is null', () => {
      const result = IngredientFilterUtil.buildFolderFilter(null);
      expect(result).toEqual({ folder: null });
    });
  });

  describe('buildTrainingFilter', () => {
    it('should exclude training ingredients by default', () => {
      const result = IngredientFilterUtil.buildTrainingFilter(undefined);
      expect(result).toEqual({ training: null });
    });

    it('should filter by training ID when valid ObjectId provided', () => {
      const trainingId = '507f191e810c19729de860ee';
      const result = IngredientFilterUtil.buildTrainingFilter(trainingId);
      expect(result).toEqual({ training: trainingId });
    });

    it('should exclude training when invalid ID provided', () => {
      const result = IngredientFilterUtil.buildTrainingFilter('invalid');
      expect(result).toEqual({ training: null });
    });
  });

  describe('buildBrandFilter', () => {
    it('should filter by brand ID when valid ObjectId provided', () => {
      const brandId = '507f191e810c19729de860ee';
      const result = IngredientFilterUtil.buildBrandFilter(brandId);
      expect(result).toEqual(brandId);
    });

    it('should assert brandId is set (not null) when no ID provided', () => {
      const result = IngredientFilterUtil.buildBrandFilter(undefined);
      expect(result).toEqual({ not: null });
    });
  });

  describe('buildMetadataLookup', () => {
    it('should return metadata include', () => {
      const result = IngredientFilterUtil.buildMetadataLookup();
      expect(result).toEqual({ include: { metadata: true } });
    });
  });

  describe('buildPromptLookup', () => {
    it('should return prompt include', () => {
      const result = IngredientFilterUtil.buildPromptLookup();
      expect(result).toEqual({ include: { prompt: true } });
    });

    it('should return empty object when lightweight is true', () => {
      const result = IngredientFilterUtil.buildPromptLookup(true);
      expect(result).toEqual({});
    });
  });
});
