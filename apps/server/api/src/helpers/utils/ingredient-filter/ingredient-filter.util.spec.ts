import { IngredientFilterUtil } from '@api/helpers/utils/ingredient-filter/ingredient-filter.util';

describe('IngredientFilterUtil', () => {
  describe('buildParentFilter', () => {
    it('should filter root ingredients when parent is null', () => {
      const result = IngredientFilterUtil.buildParentFilter(null);
      expect(result).toEqual({ parent: { not: false } });
    });

    it('should filter root ingredients when parent is "null" string', () => {
      const result = IngredientFilterUtil.buildParentFilter('null');
      expect(result).toEqual({ parent: { not: false } });
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
    it('should filter root level when folder is undefined', () => {
      const result = IngredientFilterUtil.buildFolderFilter(undefined);
      expect(result).toEqual({ folder: { not: false } });
    });

    it('should filter by folder ID when valid ObjectId provided', () => {
      const folderId = '507f191e810c19729de860ee';
      const result = IngredientFilterUtil.buildFolderFilter(folderId);
      expect(result).toEqual({ folder: folderId });
    });

    it('should filter root level when folder is null', () => {
      const result = IngredientFilterUtil.buildFolderFilter(null);
      expect(result).toEqual({ folder: { not: false } });
    });
  });

  describe('buildTrainingFilter', () => {
    it('should exclude training ingredients by default', () => {
      const result = IngredientFilterUtil.buildTrainingFilter(undefined);
      expect(result).toEqual({ training: { not: false } });
    });

    it('should filter by training ID when valid ObjectId provided', () => {
      const trainingId = '507f191e810c19729de860ee';
      const result = IngredientFilterUtil.buildTrainingFilter(trainingId);
      expect(result).toEqual({ training: trainingId });
    });

    it('should exclude training when invalid ID provided', () => {
      const result = IngredientFilterUtil.buildTrainingFilter('invalid');
      expect(result).toEqual({ training: { not: false } });
    });
  });

  describe('buildFormatFilterStage', () => {
    it('should return empty array when no format specified', () => {
      const result = IngredientFilterUtil.buildFormatFilterStage();
      expect(result).toEqual([]);
    });

    it('should build square format filter', () => {
      const result = IngredientFilterUtil.buildFormatFilterStage('square');
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        match: {
          $expr: { $eq: ['$metadata.width', '$metadata.height'] },
        },
      });
    });

    it('should build landscape format filter', () => {
      const result = IngredientFilterUtil.buildFormatFilterStage('landscape');
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        match: {
          $expr: { gt: ['$metadata.width', '$metadata.height'] },
        },
      });
    });

    it('should build portrait format filter', () => {
      const result = IngredientFilterUtil.buildFormatFilterStage('portrait');
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        match: {
          $expr: { lt: ['$metadata.width', '$metadata.height'] },
        },
      });
    });

    it('should return empty array for unrecognized format', () => {
      const result = IngredientFilterUtil.buildFormatFilterStage('invalid');
      expect(result).toEqual([]);
    });
  });

  describe('buildBrandFilter', () => {
    it('should filter by brand ID when valid ObjectId provided', () => {
      const brandId = '507f191e810c19729de860ee';
      const result = IngredientFilterUtil.buildBrandFilter(brandId);
      expect(result).toEqual(brandId);
    });

    it('should filter for any existing brand when no ID provided', () => {
      const result = IngredientFilterUtil.buildBrandFilter(undefined);
      expect(result).toEqual({ not: true });
    });
  });

  describe('buildMetadataLookup', () => {
    it('should return metadata lookup pipeline stages', () => {
      const result = IngredientFilterUtil.buildMetadataLookup();
      expect(result.length).toBeGreaterThanOrEqual(2);
      expect(result[0].relationInclude).toBeDefined();
      expect(result[0].relationInclude.from).toBe('metadata');
      expect(result[1].relationFlatten).toBeDefined();
    });
  });

  describe('buildPromptLookup', () => {
    it('should return prompt lookup pipeline stages', () => {
      const result = IngredientFilterUtil.buildPromptLookup();
      expect(result).toHaveLength(2);
      expect(result[0].relationInclude).toBeDefined();
      expect(result[0].relationInclude.from).toBe('prompts');
    });

    it('should return empty array when lightweight is true', () => {
      const result = IngredientFilterUtil.buildPromptLookup(true);
      expect(result).toEqual([]);
    });
  });
});
