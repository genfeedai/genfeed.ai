import { IngredientCategory } from '@genfeedai/enums';
import type { IImage } from '@genfeedai/interfaces';
import { Ingredient } from '@models/content/ingredient.model';

export class Image extends Ingredient {
  public readonly category =
    IngredientCategory.IMAGE as IngredientCategory.IMAGE;

  constructor(partial: Partial<IImage>) {
    super(partial);

    Object.assign(this, {
      ...partial,
      category: IngredientCategory.IMAGE,
    });
  }
}
