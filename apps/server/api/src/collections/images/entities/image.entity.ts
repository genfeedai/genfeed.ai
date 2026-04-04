import { IngredientEntity } from '@api/collections/ingredients/entities/ingredient.entity';
import { Types } from 'mongoose';

export class ImageEntity extends IngredientEntity {
  declare readonly metadata: Types.ObjectId;
}
