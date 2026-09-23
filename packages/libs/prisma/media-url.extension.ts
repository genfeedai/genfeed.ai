import {
  ingredientMediaUrl,
  type MediaUrlConfig,
} from '@libs/media/media-url.util';

/** The derived field this extension owns on `Ingredient`. */
const DERIVED_FIELD = 'cdnUrl';

type IngredientWriteParams = {
  args: unknown;
  operation: string;
  query: (args: unknown) => Promise<unknown>;
};

export type MediaUrlExtension = {
  result: {
    ingredient: {
      cdnUrl: {
        needs: { s3Key: true };
        compute: (ingredient: { s3Key: string | null }) => string | null;
      };
    };
  };
  query: {
    ingredient: {
      $allOperations: (params: IngredientWriteParams) => Promise<unknown>;
    };
  };
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function withoutDerivedField(data: unknown): unknown {
  if (Array.isArray(data)) {
    return data.map(withoutDerivedField);
  }
  if (!isPlainObject(data) || !(DERIVED_FIELD in data)) {
    return data;
  }
  const { [DERIVED_FIELD]: _derived, ...rest } = data;
  return rest;
}

/**
 * Drops the derived `cdnUrl` from ingredient write payloads.
 *
 * `cdnUrl` is computed on every read, so an ingredient that is read and then
 * spread into a create or update carries it. Prisma rejects an unknown write
 * argument, and the value would be meaningless anyway: it is always derived
 * from `s3Key`. Stripping it keeps the field read-only by construction.
 */
function stripDerivedFromWriteArgs(args: unknown): unknown {
  if (!isPlainObject(args)) {
    return args;
  }

  const next: Record<string, unknown> = { ...args };
  for (const key of ['data', 'create', 'update'] as const) {
    if (key in next) {
      next[key] = withoutDerivedField(next[key]);
    }
  }
  return next;
}

/**
 * Makes `Ingredient.cdnUrl` a derived, read-only field.
 *
 * It is computed from the record's own `s3Key` on every read: top-level
 * reads, nested `include` reads, and whenever a `select` asks for it (Prisma
 * fetches `s3Key` to compute it). Because it is derived from the row's own
 * key, a URL can only be minted for the object that row owns, and because it
 * is not a column, it is stripped from writes rather than persisted.
 */
export function createMediaUrlExtension(
  config: MediaUrlConfig,
): MediaUrlExtension {
  return {
    query: {
      ingredient: {
        async $allOperations({ args, query }) {
          return query(stripDerivedFromWriteArgs(args));
        },
      },
    },
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
