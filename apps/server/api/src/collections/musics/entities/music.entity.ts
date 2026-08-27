import { IngredientEntity } from '@server/collections/ingredients/entities/ingredient.entity';

export class MusicEntity extends IngredientEntity {
  declare readonly metadata: string;
}
