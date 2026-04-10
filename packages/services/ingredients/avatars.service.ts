import type { Ingredient } from '@genfeedai/models/content/ingredient.model';
import { IngredientsService } from '@services/content/ingredients.service';

export class AvatarsService extends IngredientsService<Ingredient> {
  private static avatarInstances = new Map<string, AvatarsService>();

  constructor(token: string) {
    super('avatars', token);
  }

  static getInstance(token: string): AvatarsService {
    if (!AvatarsService.avatarInstances.has(token)) {
      AvatarsService.avatarInstances.set(token, new AvatarsService(token));
    }
    return AvatarsService.avatarInstances.get(token)!;
  }
}
