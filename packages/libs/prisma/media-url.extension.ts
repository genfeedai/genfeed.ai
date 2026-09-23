import {
  ingredientMediaUrl,
  type MediaUrlConfig,
} from '@libs/media/media-url.util';

export type MediaUrlExtension = {
  result: {
    ingredient: {
      cdnUrl: {
        needs: { s3Key: true };
        compute: (ingredient: { s3Key: string | null }) => string | null;
      };
    };
  };
};

/**
 * Computes `Ingredient.cdnUrl` from the record's own `s3Key` on every read.
 *
 * `cdnUrl` is no longer a column. As a Prisma result field it is present on
 * top-level reads, on nested `include` reads, and whenever a `select` asks for
 * it (Prisma fetches `s3Key` to compute it). Because it is derived from the
 * row's own key, a URL can only ever be minted for the object that row owns,
 * and because it is not a column, it can never be written back.
 */
export function createMediaUrlExtension(
  config: MediaUrlConfig,
): MediaUrlExtension {
  return {
    result: {
      ingredient: {
        cdnUrl: {
          needs: { s3Key: true },
          compute: (ingredient) => ingredientMediaUrl(ingredient, config),
        },
      },
    },
  };
}
