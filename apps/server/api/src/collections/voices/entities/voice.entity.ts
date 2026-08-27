import { IngredientEntity } from '@server/collections/ingredients/entities/ingredient.entity';

export class VoiceEntity extends IngredientEntity {
  declare readonly metadata: string;
  declare readonly provider: string;
}
