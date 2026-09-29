import { describe, expect, it } from 'vitest';
import { IngredientCategory } from '..';

import {
  createLibraryAssetRoute,
  LIBRARY_ASSET_QUERY_KEY,
  LIBRARY_ROUTE_BY_INGREDIENT_CATEGORY,
  resolveLibraryRouteForCategory,
} from './library-asset-routes.constant';
import { APP_ROUTES } from './routes.constant';

/**
 * Route directories that exist under
 * `apps/app/app/(protected)/[orgSlug]/[brandSlug]/library`. A destination
 * outside this set renders a 404, so every mapped route must be in it.
 */

describe('library-asset-routes.constant', () => {
  describe('LIBRARY_ROUTE_BY_INGREDIENT_CATEGORY', () => {
    it('never leaks a SCREAMING_SNAKE category into a route', () => {
      for (const route of Object.values(LIBRARY_ROUTE_BY_INGREDIENT_CATEGORY)) {
        expect(route.split('?')[0]).toBe(route.split('?')[0].toLowerCase());
        expect(route.split('?')[0]).not.toContain('_');
      }
    });

    it('routes edit variants to the surface that lists them', () => {
      expect(
        LIBRARY_ROUTE_BY_INGREDIENT_CATEGORY[IngredientCategory.IMAGE_EDIT],
      ).toBe(APP_ROUTES.LIBRARY.IMAGES);
      expect(
        LIBRARY_ROUTE_BY_INGREDIENT_CATEGORY[IngredientCategory.VIDEO_EDIT],
      ).toBe(APP_ROUTES.LIBRARY.VIDEOS);
    });

    it('maps MUSIC to the singular /library/music route', () => {
      expect(
        LIBRARY_ROUTE_BY_INGREDIENT_CATEGORY[IngredientCategory.MUSIC],
      ).toBe(APP_ROUTES.LIBRARY.MUSIC);
      expect(
        LIBRARY_ROUTE_BY_INGREDIENT_CATEGORY[IngredientCategory.MUSIC],
      ).not.toContain('musics');
    });
  });

  describe('resolveLibraryRouteForCategory', () => {
    it('resolves canonical enum values', () => {
      expect(resolveLibraryRouteForCategory(IngredientCategory.IMAGE)).toBe(
        APP_ROUTES.LIBRARY.IMAGES,
      );
      expect(resolveLibraryRouteForCategory(IngredientCategory.VOICE)).toBe(
        APP_ROUTES.LIBRARY.VOICES,
      );
    });

    it('accepts legacy lowercase values from persisted rows', () => {
      expect(resolveLibraryRouteForCategory('image')).toBe(
        APP_ROUTES.LIBRARY.IMAGES,
      );
      expect(resolveLibraryRouteForCategory('image_edit')).toBe(
        APP_ROUTES.LIBRARY.IMAGES,
      );
    });

    it('falls back to Overview for unknown and non-string input', () => {
      expect(resolveLibraryRouteForCategory('nonsense')).toBe(
        APP_ROUTES.LIBRARY.ASSETS,
      );
      expect(resolveLibraryRouteForCategory(undefined)).toBe(
        APP_ROUTES.LIBRARY.ASSETS,
      );
      expect(resolveLibraryRouteForCategory(null)).toBe(
        APP_ROUTES.LIBRARY.ASSETS,
      );
      expect(resolveLibraryRouteForCategory(7)).toBe(APP_ROUTES.LIBRARY.ASSETS);
    });
  });

  describe('createLibraryAssetRoute', () => {
    it('returns the bare list route when no id is given', () => {
      expect(createLibraryAssetRoute(IngredientCategory.VIDEO)).toBe(
        APP_ROUTES.LIBRARY.VIDEOS,
      );
      expect(createLibraryAssetRoute(IngredientCategory.VIDEO, '')).toBe(
        APP_ROUTES.LIBRARY.VIDEOS,
      );
    });

    it('encodes ids that are not URL-safe', () => {
      expect(createLibraryAssetRoute(IngredientCategory.IMAGE, 'a b/c')).toBe(
        `${APP_ROUTES.LIBRARY.IMAGES}&${LIBRARY_ASSET_QUERY_KEY}=a+b%2Fc`,
      );
    });
  });
});
