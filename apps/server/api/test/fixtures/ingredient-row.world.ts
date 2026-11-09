/** One ingredient row, as the status-transition helpers see it. */
export type IngredientWorldRow = Record<string, unknown>;

/**
 * Stands in for the ingredients table holding one row: a bulk write lands
 * only when every filter column matches, the way a compare-and-set
 * `updateMany` does, while a plain `patch` by id always lands.
 */
export function ingredientRowWorld(row: IngredientWorldRow) {
  return {
    patch: async (id: string, update: Record<string, unknown>) => {
      if (row.id === id) Object.assign(row, update);
      return row;
    },
    patchAll: async (
      filter: Record<string, unknown>,
      update: Record<string, unknown>,
    ) => {
      const isMatch = Object.entries(filter).every(
        ([key, value]) => row[key] === value,
      );
      if (isMatch) Object.assign(row, update);
      return { modifiedCount: isMatch ? 1 : 0 };
    },
  };
}
