import type { IVideo } from '@genfeedai/interfaces';
import { IngredientCategory } from '@genfeedai/enums';
import { Ingredient } from '@models/content/ingredient.model';

export class Video extends Ingredient {
  public readonly category =
    IngredientCategory.VIDEO as IngredientCategory.VIDEO;

  constructor(partial: Partial<IVideo>) {
    super(partial);
    Object.assign(this, {
      ...partial,
      category: IngredientCategory.VIDEO,
    });
  }
}
