import type { GIF } from '@genfeedai/models/ingredients/gif.model';
import { IngredientsService } from '@services/content/ingredients.service';

export class GIFsService extends IngredientsService<GIF> {
  constructor(token: string) {
    super('gifs', token);
  }

  static getInstance(token: string): GIFsService {
    return IngredientsService.getDataServiceInstance(GIFsService, token);
  }
}
