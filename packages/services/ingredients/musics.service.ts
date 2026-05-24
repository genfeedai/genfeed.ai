import type { IMusic } from '@genfeedai/interfaces';
import type { Music } from '@genfeedai/models/ingredients/music.model';
import { MusicSerializer } from '@genfeedai/serializers';
import { IngredientsService } from '@services/content/ingredients.service';
import type { JsonApiResponseDocument } from '@services/core/base.service';
import { ServiceInstanceManager } from '@services/core/service-instance-manager';

const musicInstances = new ServiceInstanceManager<MusicsService>();

export class MusicsService extends IngredientsService<Music> {
  constructor(token: string) {
    super('musics', token);
  }

  static getInstance(token: string): MusicsService {
    const cached = musicInstances.get(MusicsService, token);
    if (cached) {
      return cached;
    }

    const instance = new MusicsService(token);
    musicInstances.set(MusicsService, token, instance);
    return instance;
  }

  public async post(body: Partial<IMusic>) {
    // Use the MusicSerializer to properly serialize the data
    const data = MusicSerializer.serialize(body);
    return await this.instance
      .post<JsonApiResponseDocument>('', data) // Empty string for root path, data as second argument
      .then((res) => this.mapOne(res.data));
  }
}
