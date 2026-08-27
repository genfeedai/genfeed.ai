import { IngredientEntity } from '@server/collections/ingredients/entities/ingredient.entity';

export class AvatarEntity extends IngredientEntity {
  declare readonly metadata: string;
}
