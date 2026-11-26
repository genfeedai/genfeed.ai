/** Which side of the `sources` / `sourceOf` relation a lineage read follows. */
export enum IngredientLineageDirection {
  /** References used to produce the asset. */
  MADE_FROM = 'made-from',
  /** Assets that used the asset as a reference. */
  USED_IN = 'used-in',
}

/** Lineage strips load one page of this size per direction. */
export const INGREDIENT_LINEAGE_PAGE_SIZE = 24;

/**
 * How a child asset relates to its parent (#7395). Persisted as the Prisma
 * `IngredientRelationKind` enum, so these values equal the Postgres labels.
 * A link written before relations were recorded has no kind and is never
 * guessed.
 */
export enum IngredientRelationKind {
  /** A new take on the asset: it replaces the parent in the asset's history. */
  VERSION = 'VERSION',
  /** The same asset processed (upscaled, enhanced): part of its history. */
  TRANSFORMATION = 'TRANSFORMATION',
  /** A different asset made from this one (a crop, a resize). Not a version. */
  DERIVATIVE = 'DERIVATIVE',
  /** An asset used as a reference to make this one. */
  SOURCE = 'SOURCE',
}

/** The kinds whose children belong to the parent's version history. */
export const INGREDIENT_VERSION_RELATION_KINDS: readonly IngredientRelationKind[] =
  [IngredientRelationKind.VERSION, IngredientRelationKind.TRANSFORMATION];

/**
 * What an entry in a version history was created by. `ORIGINAL` is the first
 * asset of the history; `UNAVAILABLE` is an asset linked to a parent before
 * relations were recorded, whose history is not known.
 */
export enum IngredientVersionRelation {
  ORIGINAL = 'original',
  VERSION = 'version',
  TRANSFORMATION = 'transformation',
  UNAVAILABLE = 'unavailable',
}

/** A version history never lists more than this many assets. */
export const INGREDIENT_VERSION_HISTORY_LIMIT = 50;
