import { IngredientCategory } from '@genfeedai/enums';
import type { IMusic } from '@genfeedai/interfaces';
import { Ingredient } from '@models/content/ingredient.model';

export class Music extends Ingredient implements IMusic {
  public readonly category =
    IngredientCategory.MUSIC as IngredientCategory.MUSIC;

  constructor(partial: Partial<IMusic>) {
    super(partial);
    Object.assign(this, {
      ...partial,
      category: IngredientCategory.MUSIC,
    });
  }
}
