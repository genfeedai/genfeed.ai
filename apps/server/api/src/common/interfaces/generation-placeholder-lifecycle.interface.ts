/**
 * Internal handoff invoked once the primary generation Ingredient is durable.
 * The provider boundary must await it before starting external work.
 */
export type GenerationPlaceholderCreatedCallback = (
  ingredientId: string,
) => Promise<void>;
