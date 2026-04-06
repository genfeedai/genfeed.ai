import { Caption as BaseCaption } from '@genfeedai/client/models';
import type { ICaption, IIngredient } from '@genfeedai/interfaces';
import { Ingredient } from '@models/content/ingredient.model';

export class Caption extends BaseCaption {
  constructor(partial: Partial<ICaption>) {
    super(partial);

    if (partial?.ingredient && typeof partial.ingredient === 'object') {
      this.ingredient = new Ingredient(
        partial.ingredient as IIngredient,
      ) as unknown as IIngredient;
    }
  }
}
