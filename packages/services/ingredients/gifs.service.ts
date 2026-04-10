import type { GIF } from '@genfeedai/models/ingredients/gif.model';
import { IngredientsService } from '@services/content/ingredients.service';

export class GIFsService extends IngredientsService<GIF> {
  private static gifInstances = new Map<string, GIFsService>();

  constructor(token: string) {
    super('gifs', token);
  }

  static getInstance(token: string): GIFsService {
    if (!GIFsService.gifInstances.has(token)) {
      GIFsService.gifInstances.set(token, new GIFsService(token));
    }
    return GIFsService.gifInstances.get(token)!;
  }
}
