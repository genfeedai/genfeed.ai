import { IngredientCategory } from '@genfeedai/contracts';
import type { IImage } from '@genfeedai/contracts/interfaces';
import { Ingredient } from '@models/content/ingredient.model';

export class Image extends Ingredient {
  public readonly category: IngredientCategory = IngredientCategory.IMAGE;

  constructor(partial: Partial<IImage>) {
    super(partial);

    Object.assign(this, {
      ...partial,
      category: IngredientCategory.IMAGE,
    });
  }
}
