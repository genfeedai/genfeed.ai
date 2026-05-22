import type { VoiceProvider } from '@genfeedai/enums';
import type { Voice } from '@genfeedai/models/ingredients/voice.model';
import { IngredientsService } from '@services/content/ingredients.service';
import type { JsonApiResponseDocument } from '@services/core/base.service';
import { ServiceInstanceManager } from '@services/core/service-instance-manager';

const voiceInstances = new ServiceInstanceManager<VoicesService>();

export class VoicesService extends IngredientsService<Voice> {
  constructor(token: string) {
    super('voices', token);
  }

  static getInstance(token: string): VoicesService {
    const cached = voiceInstances.get(VoicesService, token);
    if (cached) {
      return cached;
    }

    const instance = new VoicesService(token);
    voiceInstances.set(VoicesService, token, instance);
    return instance;
  }

  async importCatalogVoices(providers?: VoiceProvider[]): Promise<Voice[]> {
    return await this.instance
      .post<JsonApiResponseDocument>('/import', providers ? { providers } : {})
      .then((res) => this.mapMany(res.data));
  }
}
