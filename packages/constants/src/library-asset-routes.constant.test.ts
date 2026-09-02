import { IngredientCategory } from '@genfeedai/enums';
import { describe, expect, it } from 'vitest';

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
const EXISTING_LIBRARY_ROUTES = new Set<string>([
  APP_ROUTES.LIBRARY.AVATARS,
  APP_ROUTES.LIBRARY.CAPTIONS,
  APP_ROUTES.LIBRARY.GIFS,
  APP_ROUTES.LIBRARY.IMAGES,
  APP_ROUTES.LIBRARY.MUSIC,
  APP_ROUTES.LIBRARY.ASSETS,
  APP_ROUTES.LIBRARY.VIDEOS,
  APP_ROUTES.LIBRARY.VOICES,
]);

describe('library-asset-routes.constant', () => {
  describe('LIBRARY_ROUTE_BY_INGREDIENT_CATEGORY', () => {
    it('covers every IngredientCategory member', () => {
      for (const category of Object.values(IngredientCategory)) {
        expect(LIBRARY_ROUTE_BY_INGREDIENT_CATEGORY[category]).toBeDefined();
      }
    });

    it('only points at library routes that exist in the route tree', () => {
      for (const route of Object.values(LIBRARY_ROUTE_BY_INGREDIENT_CATEGORY)) {
        expect(EXISTING_LIBRARY_ROUTES.has(route)).toBe(true);
      }
    });

    it('never leaks a SCREAMING_SNAKE category into a route', () => {
      for (const route of Object.values(LIBRARY_ROUTE_BY_INGREDIENT_CATEGORY)) {
        expect(route).toBe(route.toLowerCase());
        expect(route).not.toContain('_');
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
    it('appends the asset deep-link query when an id is given', () => {
      expect(createLibraryAssetRoute(IngredientCategory.IMAGE, 'ing_123')).toBe(
        `${APP_ROUTES.LIBRARY.IMAGES}?${LIBRARY_ASSET_QUERY_KEY}=ing_123`,
      );
    });

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
        `${APP_ROUTES.LIBRARY.IMAGES}?${LIBRARY_ASSET_QUERY_KEY}=a%20b%2Fc`,
      );
    });

    it('produces a lowercase path for every category', () => {
      for (const category of Object.values(IngredientCategory)) {
        const [path] = createLibraryAssetRoute(category, 'ing_1').split('?');
        expect(path).toBe(path?.toLowerCase());
      }
    });
  });
});
