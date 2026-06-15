import type { VoiceProvider } from '@genfeedai/enums';
import type { ExternalVoice } from '@genfeedai/models/elements/external-voice.model';
import type { Voice } from '@genfeedai/models/ingredients/voice.model';
import { IngredientsService } from '@services/content/ingredients.service';
import type { JsonApiResponseDocument } from '@services/core/base.service';
import { ServiceInstanceManager } from '@services/core/service-instance-manager';

const voiceInstances = new ServiceInstanceManager<VoicesService>();

export interface CatalogSyncResult {
  created: number;
  updated: number;
  total: number;
}

export interface CatalogFindParams {
  provider?: VoiceProvider;
  search?: string;
}

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

  async findCatalog(params: CatalogFindParams = {}): Promise<ExternalVoice[]> {
    const query: Record<string, unknown> = {};
    if (params.provider) {
      query['provider'] = params.provider;
    }
    if (params.search) {
      query['search'] = params.search;
    }

    return this.executeWithErrorHandling(
      'GET /voices/catalog',
      this.instance
        .get<JsonApiResponseDocument>('/catalog', { params: query })
        .then((res) => this.extractCollection<ExternalVoice>(res.data)),
    );
  }

  async importCatalogVoices(
    providers?: VoiceProvider[],
  ): Promise<CatalogSyncResult> {
    return this.executeWithErrorHandling(
      'POST /voices/import',
      this.instance
        .post<{ data: CatalogSyncResult }>(
          '/import',
          providers ? { providers } : {},
        )
        .then((res) => res.data.data),
    );
  }

  async patchCatalogVoice(
    id: string,
    data: Partial<
      Pick<ExternalVoice, 'isActive' | 'isDefaultSelectable' | 'isFeatured'>
    >,
  ): Promise<ExternalVoice> {
    return this.executeWithErrorHandling(
      `PATCH /voices/catalog/${id}`,
      this.instance
        .patch<JsonApiResponseDocument>(`/catalog/${id}`, data)
        .then((res) => this.extractResource<ExternalVoice>(res.data)),
    );
  }
}
