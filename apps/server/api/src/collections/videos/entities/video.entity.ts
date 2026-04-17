import { IngredientEntity } from '@api/collections/ingredients/entities/ingredient.entity';

export class VideoEntity extends IngredientEntity {
  declare readonly metadata: string;
  declare readonly language: string;
  declare readonly posts?: string[];
}
