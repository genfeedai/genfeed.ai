import { IngredientEntity } from '@api/collections/ingredients/entities/ingredient.entity';
import { Types } from 'mongoose';

export class VideoEntity extends IngredientEntity {
  declare readonly metadata: Types.ObjectId;
  declare readonly language: string;
  declare readonly posts?: Types.ObjectId[];
}
