import { IngredientCategory } from '@genfeedai/contracts';
import type { ISound } from '@genfeedai/contracts/interfaces';
import { Ingredient } from '@models/content/ingredient.model';

export class Sound extends Ingredient implements ISound {
  public readonly category =
    IngredientCategory.AUDIO as IngredientCategory.AUDIO;

  public label?: string;
  public description?: string;
}
