import { IngredientEntity } from '@api/collections/ingredients/entities/ingredient.entity';
import { Types } from 'mongoose';

export class AvatarEntity extends IngredientEntity {
  declare readonly metadata: Types.ObjectId;
}
