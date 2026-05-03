import { TrainingFilterUtil } from '@api/helpers/utils/training-filter/training-filter.util';
import { IngredientCategory } from '@genfeedai/enums';

describe('TrainingFilterUtil', () => {
  describe('buildSourceImagesFilter', () => {
    it('builds source image where fragment with user filter', () => {
      const filter = TrainingFilterUtil.buildSourceImagesFilter({
        category: IngredientCategory.IMAGE,
        sourceIds: ['image-1', 'image-2'],
        userId: 'user-1',
      });

      expect(filter).toEqual({
        category: IngredientCategory.IMAGE,
        id: { in: ['image-1', 'image-2'] },
        isDeleted: false,
        user: 'user-1',
      });
    });

    it('omits user filter when userId is missing', () => {
      const filter = TrainingFilterUtil.buildSourceImagesFilter({
        category: IngredientCategory.IMAGE,
        sourceIds: ['image-1'],
      });

      expect(filter).toEqual({
        category: IngredientCategory.IMAGE,
        id: { in: ['image-1'] },
        isDeleted: false,
      });
    });
  });

  describe('buildGeneratedImagesFilter', () => {
    it('builds generated image where fragment with metadata filtering', () => {
      const filter = TrainingFilterUtil.buildGeneratedImagesFilter({
        metadataIds: ['metadata-1', 'metadata-2'],
      });

      expect(filter).toEqual({
        category: 'IMAGE',
        isDeleted: false,
        metadata: { in: ['metadata-1', 'metadata-2'] },
      });
    });
  });
});
