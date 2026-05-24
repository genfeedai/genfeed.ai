import type { Ingredient } from '@genfeedai/models/content/ingredient.model';
import { IngredientsService } from '@services/content/ingredients.service';

export class AvatarsService extends IngredientsService<Ingredient> {
  constructor(token: string) {
    super('avatars', token);
  }

  static getInstance(token: string): AvatarsService {
    return IngredientsService.getDataServiceInstance(AvatarsService, token);
  }
}
