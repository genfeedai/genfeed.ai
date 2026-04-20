import { IngredientEntity } from '@api/collections/ingredients/entities/ingredient.entity';

export class AvatarEntity extends IngredientEntity {
  declare readonly metadata: string;
}
