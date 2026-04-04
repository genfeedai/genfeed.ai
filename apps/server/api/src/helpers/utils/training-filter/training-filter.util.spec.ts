import { TrainingFilterUtil } from '@api/helpers/utils/training-filter/training-filter.util';
import { IngredientCategory } from '@genfeedai/enums';

describe('TrainingFilterUtil', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  describe('buildSourceImagesLookup', () => {
    it('builds lookup stage with normalized variables and filters', () => {
      const lookup = TrainingFilterUtil.buildSourceImagesLookup({
        as: 'sourceImagesOut',
        category: IngredientCategory.IMAGE,
        sourceIdsVar: 'sources',
        userIdVar: '$$userId',
      });

      expect(lookup.$lookup.from).toBe('ingredients');
      expect(lookup.$lookup.let).toEqual({
        sourceIds: '$sources',
        userId: '$$userId',
      });
      expect(lookup.$lookup.as).toBe('sourceImagesOut');

      const matchExpr = lookup.$lookup.pipeline[0].$match.$expr.$and;
      expect(matchExpr).toEqual(
        expect.arrayContaining([
          { $eq: ['$user', '$$userId'] },
          { $eq: ['$category', IngredientCategory.IMAGE] },
          { $in: ['$_id', '$$sourceIds'] },
          { $eq: ['$isDeleted', false] },
        ]),
      );
    });

    it('uses default alias and category when not provided', () => {
      const lookup = TrainingFilterUtil.buildSourceImagesLookup({
        sourceIdsVar: '$$sourceIds',
        userIdVar: 'user',
      });

      expect(lookup.$lookup.as).toBe('sourceImages');
      const matchExpr = lookup.$lookup.pipeline[0].$match.$expr.$and;
      expect(matchExpr).toEqual(
        expect.arrayContaining([
          { $eq: ['$category', IngredientCategory.IMAGE] },
        ]),
      );
    });
  });

  describe('buildGeneratedImagesLookup', () => {
    it('builds lookup stage for generated images with metadata filtering', () => {
      const lookup = TrainingFilterUtil.buildGeneratedImagesLookup({
        as: 'generated',
        category: IngredientCategory.VIDEO,
        metadataIdsVar: 'metadataIds',
      });

      expect(lookup.$lookup.from).toBe('ingredients');
      expect(lookup.$lookup.let).toEqual({
        metadataIds: '$metadataIds',
      });
      expect(lookup.$lookup.as).toBe('generated');

      const matchExpr = lookup.$lookup.pipeline[0].$match.$expr.$and;
      expect(matchExpr).toEqual(
        expect.arrayContaining([
          { $eq: ['$category', IngredientCategory.VIDEO] },
          { $in: ['$metadata', '$$metadataIds'] },
          { $eq: ['$isDeleted', false] },
        ]),
      );
    });

    it('defaults to image category and generatedImages alias', () => {
      const lookup = TrainingFilterUtil.buildGeneratedImagesLookup({
        metadataIdsVar: '$$metadataIds',
      });

      expect(lookup.$lookup.as).toBe('generatedImages');
      const matchExpr = lookup.$lookup.pipeline[0].$match.$expr.$and;
      expect(matchExpr).toEqual(
        expect.arrayContaining([
          { $eq: ['$category', IngredientCategory.IMAGE] },
        ]),
      );
    });
  });
});
