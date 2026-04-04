import type { IImage } from '@cloud/interfaces';
import { IngredientCategory } from '@genfeedai/enums';
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
