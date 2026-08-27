/**
 * Internal handoff invoked once the primary generation Ingredient is durable.
 * The provider boundary must await it before starting external work.
 */
export type GenerationPlaceholderCreatedCallback = (
  ingredientId: string,
) => Promise<void>;

/** Durable ownership used to recover only placeholders created for one run. */
export interface GenerationPlaceholderScope {
  groupId: string;
  groupIndex: number;
  isByokBypass?: boolean;
  settleCreditsExternally?: boolean;
}
