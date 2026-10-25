/**
 * What one generated asset cost in credits. `credits` is null when no credit
 * hold paid for it (a bring-your-own-key run, a released hold, an upload).
 * `reserved` means the generation is still running, so the figure may change
 * when it settles.
 */
export interface IIngredientGenerationCost {
  credits: number | null;
  status: 'reserved' | 'settled' | null;
}
