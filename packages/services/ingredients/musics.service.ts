import type { IMusic } from '@genfeedai/interfaces';
import { MusicSerializer } from '@genfeedai/client/serializers';
import type { Music } from '@models/ingredients/music.model';
import { IngredientsService } from '@services/content/ingredients.service';
import type { JsonApiResponseDocument } from '@services/core/base.service';

export class MusicsService extends IngredientsService<Music> {
  private static musicInstances = new Map<string, MusicsService>();

  constructor(token: string) {
    super('musics', token);
  }

  static getInstance(token: string): MusicsService {
    if (!MusicsService.musicInstances.has(token)) {
      MusicsService.musicInstances.set(token, new MusicsService(token));
    }
    return MusicsService.musicInstances.get(token)!;
  }

  public async post(body: Partial<IMusic>) {
    // Use the MusicSerializer to properly serialize the data
    const data = MusicSerializer.serialize(body);
    return await this.instance
      .post<JsonApiResponseDocument>('', data) // Empty string for root path, data as second argument
      .then((res) => this.mapOne(res.data));
  }
}
