import type { IImage, ITraining } from '@genfeedai/interfaces';
import { Training as BaseTraining } from '@genfeedai/client/models';
import { IngredientCategory } from '@genfeedai/enums';
import { Image } from '@models/ingredients/image.model';

export class Training extends BaseTraining {
  constructor(partial: Partial<ITraining>) {
    super(partial);

    if (partial.sources && Array.isArray(partial.sources)) {
      this.sources = (partial.sources as string[]).map(
        (source: string) =>
          new Image({
            category: IngredientCategory.IMAGE,
            id: source,
          }),
      ) as unknown as IImage[];
    }
  }
}
