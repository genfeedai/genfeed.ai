import {
  createPostIngredientLinks,
  distinctIngredientIds,
  flattenLoadedPostIngredients,
  flattenPostIngredients,
  flattenPostTreeIngredients,
  orderedPostIngredientLinks,
  POST_INGREDIENT_LINK_ORDER,
  postIngredientIds,
  postIngredientLinkRows,
  replacePostIngredientLinks,
} from '@api/collections/posts/services/post-ingredient-links.util';
import { describe, expect, it } from 'vitest';

describe('post ingredient links', () => {
  describe('writes', () => {
    it('positions each ingredient by its place in the arranged array', () => {
      expect(postIngredientLinkRows('org-1', ['c', 'a', 'b'])).toEqual([
        { ingredientId: 'c', organizationId: 'org-1', position: 0 },
        { ingredientId: 'a', organizationId: 'org-1', position: 1 },
        { ingredientId: 'b', organizationId: 'org-1', position: 2 },
      ]);
    });

    it('keeps the first place of an ingredient listed twice and closes the gap', () => {
      expect(distinctIngredientIds(['a', 'b', 'a', 'c'])).toEqual([
        'a',
        'b',
        'c',
      ]);
      expect(
        postIngredientLinkRows('org-1', ['a', 'b', 'a', 'c']).map(
          (row) => row.position,
        ),
      ).toEqual([0, 1, 2]);
    });

    it('creates a new post with the arranged links', () => {
      expect(createPostIngredientLinks('org-1', ['b', 'a'])).toEqual({
        create: [
          { ingredientId: 'b', organizationId: 'org-1', position: 0 },
          { ingredientId: 'a', organizationId: 'org-1', position: 1 },
        ],
      });
    });

    it('replaces the existing links, so a reorder rewrites every position', () => {
      expect(replacePostIngredientLinks('org-1', ['b', 'a'])).toEqual({
        createMany: {
          data: [
            { ingredientId: 'b', organizationId: 'org-1', position: 0 },
            { ingredientId: 'a', organizationId: 'org-1', position: 1 },
          ],
          skipDuplicates: true,
        },
        deleteMany: { ingredientId: { notIn: ['b', 'a'] } },
        updateMany: [
          { data: { position: 0 }, where: { ingredientId: 'b' } },
          { data: { position: 1 }, where: { ingredientId: 'a' } },
        ],
      });
    });

    it('clears every link when the arrangement is empty', () => {
      expect(replacePostIngredientLinks('org-1', [])).toEqual({
        createMany: { data: [], skipDuplicates: true },
        deleteMany: { ingredientId: { notIn: [] } },
        updateMany: [],
      });
    });
  });

  describe('reads', () => {
    it('loads links by position, then link id', () => {
      expect(POST_INGREDIENT_LINK_ORDER).toEqual([
        { position: 'asc' },
        { id: 'asc' },
      ]);
      expect(orderedPostIngredientLinks()).toEqual({
        include: { ingredient: true },
        orderBy: [{ position: 'asc' }, { id: 'asc' }],
      });
    });

    it('narrows and filters the loaded media', () => {
      expect(
        orderedPostIngredientLinks(
          { select: { id: true } },
          { isDeleted: false },
        ),
      ).toEqual({
        include: { ingredient: { select: { id: true } } },
        orderBy: [{ position: 'asc' }, { id: 'asc' }],
        where: { ingredient: { isDeleted: false } },
      });
    });

    it('flattens the loaded links into the ordered ingredients array', () => {
      const post = {
        id: 'post-1',
        ingredientLinks: [
          { ingredient: { id: 'b' }, ingredientId: 'b', position: 0 },
          { ingredient: { id: 'a' }, ingredientId: 'a', position: 1 },
        ],
      };

      expect(flattenPostIngredients(post)).toEqual({
        id: 'post-1',
        ingredients: [{ id: 'b' }, { id: 'a' }],
      });
      expect(postIngredientIds(post)).toEqual(['b', 'a']);
    });

    it('returns a row that was loaded without its links unchanged', () => {
      const post = { id: 'post-1', ingredients: [{ id: 'a' }] };

      expect(flattenPostIngredients(post)).toBe(post);
      expect(postIngredientIds({})).toEqual([]);
    });

    it('flattens a post and its loaded children', () => {
      const flattened = flattenPostTreeIngredients({
        children: [
          { id: 'child', ingredientLinks: [{ ingredient: { id: 'c' } }] },
        ],
        id: 'post-1',
        ingredientLinks: [{ ingredient: { id: 'a' } }],
      });

      expect(flattened).toEqual({
        children: [{ id: 'child', ingredients: [{ id: 'c' }] }],
        id: 'post-1',
        ingredients: [{ id: 'a' }],
      });
    });

    it('flattens a row of unknown shape, children included only when loaded', () => {
      expect(flattenLoadedPostIngredients(null)).toBeNull();
      expect(
        flattenLoadedPostIngredients({
          children: [{ ingredientLinks: [{ ingredient: { id: 'c' } }] }],
          ingredientLinks: [{ ingredient: { id: 'a' } }],
        }),
      ).toEqual({
        children: [{ ingredients: [{ id: 'c' }] }],
        ingredients: [{ id: 'a' }],
      });
      expect(flattenLoadedPostIngredients({ id: 'bare' })).toEqual({
        id: 'bare',
      });
    });
  });
});
