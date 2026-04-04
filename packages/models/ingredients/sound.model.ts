import type { ISound } from '@cloud/interfaces';
import { IngredientCategory } from '@genfeedai/enums';
import { Ingredient } from '@models/content/ingredient.model';

export class Sound extends Ingredient implements ISound {
  public readonly category =
    IngredientCategory.AUDIO as IngredientCategory.AUDIO;

  public label?: string;
  public description?: string;
}
