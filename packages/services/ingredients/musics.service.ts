import type { IMusic } from '@genfeedai/contracts/interfaces';
import type { Music } from '@genfeedai/models/ingredients/music.model';
import { IngredientsService } from '@services/content/ingredients.service';
import type { JsonApiResponseDocument } from '@services/core/base.service';
import { serializeRequest } from '@services/core/request-serializers';
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
    const data = await serializeRequest('MusicSerializer', body);
    return await this.instance
      .post<JsonApiResponseDocument>('', data) // Empty string for root path, data as second argument
      .then((res) => this.mapOne(res.data));
  }
}
