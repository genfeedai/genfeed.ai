import { IngredientCategory } from '@genfeedai/contracts';
import type { IMusic } from '@genfeedai/contracts/interfaces';
import { Ingredient } from '@models/content/ingredient.model';

export class Music extends Ingredient implements IMusic {
  public readonly category: IngredientCategory = IngredientCategory.MUSIC;

  constructor(partial: Partial<IMusic>) {
    super(partial);
    Object.assign(this, {
      ...partial,
      category: IngredientCategory.MUSIC,
    });
  }
}
