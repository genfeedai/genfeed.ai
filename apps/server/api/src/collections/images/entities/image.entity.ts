import { IngredientEntity } from '@api/collections/ingredients/entities/ingredient.entity';

export class ImageEntity extends IngredientEntity {
  declare readonly metadata: string;
}
