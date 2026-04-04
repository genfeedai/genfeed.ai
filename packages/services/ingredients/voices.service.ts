import { VoiceProvider } from '@genfeedai/enums';
import type { Voice } from '@models/ingredients/voice.model';
import { IngredientsService } from '@services/content/ingredients.service';
import type { JsonApiResponseDocument } from '@services/core/base.service';

export class VoicesService extends IngredientsService<Voice> {
  private static voiceInstances = new Map<string, VoicesService>();

  constructor(token: string) {
    super('voices', token);
  }

  static getInstance(token: string): VoicesService {
    if (!VoicesService.voiceInstances.has(token)) {
      VoicesService.voiceInstances.set(token, new VoicesService(token));
    }

    return VoicesService.voiceInstances.get(token)!;
  }

  async importCatalogVoices(providers?: VoiceProvider[]): Promise<Voice[]> {
    return await this.instance
      .post<JsonApiResponseDocument>('/import', providers ? { providers } : {})
      .then((res) => this.mapMany(res.data));
  }
}
