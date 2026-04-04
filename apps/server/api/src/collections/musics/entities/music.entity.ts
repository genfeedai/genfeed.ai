import { IngredientEntity } from '@api/collections/ingredients/entities/ingredient.entity';
import { Types } from 'mongoose';

export class MusicEntity extends IngredientEntity {
  declare readonly metadata: Types.ObjectId;
}
