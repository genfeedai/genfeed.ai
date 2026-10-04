import { IngredientFilterUtil } from '@api/helpers/utils/ingredient-filter/ingredient-filter.util';
import { IngredientOrigin, TagMatchMode } from '@genfeedai/contracts';

describe('IngredientFilterUtil', () => {
  describe('buildOriginFilter', () => {
    it('matches any of the requested origins', () => {
      expect(
        IngredientFilterUtil.buildOriginFilter([
          IngredientOrigin.UPLOADED,
          IngredientOrigin.IMPORTED,
        ]),
      ).toEqual({ origin: { in: ['UPLOADED', 'IMPORTED'] } });
    });

    it.each([undefined, []])('adds no predicate for %p', (origins) => {
      expect(IngredientFilterUtil.buildOriginFilter(origins)).toEqual({});
    });
  });

  describe('buildCharacterFilter', () => {
    it('matches assets linked to any resolved character', () => {
      expect(IngredientFilterUtil.buildCharacterFilter(['p1', 'p2'])).toEqual({
        personaId: { in: ['p1', 'p2'] },
      });
    });

    it('matches nothing when every requested character was unavailable', () => {
      expect(IngredientFilterUtil.buildCharacterFilter([])).toEqual({
        personaId: { in: [] },
      });
    });

    it('adds no predicate when no character was asked for', () => {
      expect(IngredientFilterUtil.buildCharacterFilter(undefined)).toEqual({});
    });
  });

  describe('buildTagFilter', () => {
    it('matches assets carrying any of the tags by default', () => {
      const expected = {
        tags: { some: { id: { in: ['t1', 't2'] }, isDeleted: false } },
      };

      expect(
        IngredientFilterUtil.buildTagFilter(['t1', 't2'], undefined),
      ).toEqual(expected);
      expect(
        IngredientFilterUtil.buildTagFilter(['t1', 't2'], TagMatchMode.ANY),
      ).toEqual(expected);
    });

    it('requires every tag in all mode, one predicate per tag', () => {
      expect(
        IngredientFilterUtil.buildTagFilter(['t1', 't2'], TagMatchMode.ALL),
      ).toEqual({
        AND: [
          { tags: { some: { id: 't1', isDeleted: false } } },
          { tags: { some: { id: 't2', isDeleted: false } } },
        ],
      });
    });

    it('de-duplicates repeated ids so all mode never demands a tag twice', () => {
      expect(
        IngredientFilterUtil.buildTagFilter(['t1', 't1'], TagMatchMode.ALL),
      ).toEqual({ AND: [{ tags: { some: { id: 't1', isDeleted: false } } }] });
    });

    it.each([undefined, []])('adds no predicate for %p', (tagIds) => {
      expect(
        IngredientFilterUtil.buildTagFilter(tagIds, TagMatchMode.ALL),
      ).toEqual({});
    });
  });

  describe('buildLibraryTagsInclude', () => {
    it('lists only live tags with just what a chip needs', () => {
      const { tags } = IngredientFilterUtil.buildLibraryTagsInclude();

      expect(tags.where).toEqual({ isDeleted: false });
      expect(tags.orderBy).toEqual({ label: 'asc' });
      expect(Object.keys(tags.select).sort()).toEqual([
        'backgroundColor',
        'brandId',
        'id',
        'label',
        'organizationId',
        'textColor',
      ]);
    });

    it('adds tags to the unified list include without dropping row data', () => {
      expect(
        Object.keys(IngredientFilterUtil.buildLibraryListInclude()),
      ).toEqual(['metadata', 'prompt', 'tags']);
    });
  });

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
