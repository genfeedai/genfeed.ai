import { IngredientEntity } from '@api/collections/ingredients/entities/ingredient.entity';

export class VoiceEntity extends IngredientEntity {
  declare readonly metadata: string;
  declare readonly provider: string;
}
