import { IngredientEntity } from '@api/collections/ingredients/entities/ingredient.entity';
import { Types } from 'mongoose';

export class VoiceEntity extends IngredientEntity {
  declare readonly metadata: Types.ObjectId;
  declare readonly provider: string;
}
