import { IngredientCategory } from '@genfeedai/contracts';
import type { IVideo } from '@genfeedai/contracts/interfaces';
import { Ingredient } from '@models/content/ingredient.model';

export class Video extends Ingredient {
  public readonly category: IngredientCategory = IngredientCategory.VIDEO;

  constructor(partial: Partial<IVideo>) {
    super(partial);
    Object.assign(this, {
      ...partial,
      category: IngredientCategory.VIDEO,
    });
  }
}
