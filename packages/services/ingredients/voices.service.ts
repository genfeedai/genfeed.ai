import type { VoiceProvider } from '@genfeedai/contracts';
import type { ElevenLabsAccountVoicePage } from '@genfeedai/contracts/interfaces';
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

export interface AccountVoicesFindParams {
  pageToken?: string;
  search?: string;
}

export interface GenerateVoiceParams {
  /** Speech speed multiplier, 0.5-2.0. */
  speed?: number;
  text: string;
  voiceId: string;
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

  /**
   * Text-to-speech. The backend runs the synthesis inline and returns the
   * completed voice ingredient, so there is no websocket phase for this type.
   */
  async generate(params: GenerateVoiceParams): Promise<Voice> {
    return this.executeWithErrorHandling(
      'POST /voices/generate',
      this.instance
        .post<JsonApiResponseDocument>('/generate', {
          speed: params.speed,
          text: params.text,
          voiceId: params.voiceId,
          waitForCompletion: true,
        })
        .then((res) => this.mapOne(res.data)),
    );
  }

  /** One page of the connected ElevenLabs account's voices. */
  async findAccountVoices(
    params: AccountVoicesFindParams = {},
    signal?: AbortSignal,
  ): Promise<ElevenLabsAccountVoicePage> {
    return this.executeWithErrorHandling(
      'GET /voices/elevenlabs/account',
      this.instance
        .get<{ data: ElevenLabsAccountVoicePage }>('/elevenlabs/account', {
          params: {
            ...(params.pageToken ? { pageToken: params.pageToken } : {}),
            ...(params.search ? { search: params.search } : {}),
          },
          signal,
        })
        .then((res) => res.data.data),
    );
  }

  /** Saves an organization reference to a connected-account voice. */
  async importAccountVoice(externalVoiceId: string): Promise<Voice> {
    return this.executeWithErrorHandling(
      'POST /voices/elevenlabs/account/import',
      this.instance
        .post<JsonApiResponseDocument>('/elevenlabs/account/import', {
          externalVoiceId,
        })
        .then((res) => this.mapOne(res.data)),
    );
  }

  /** Removes the local reference; the ElevenLabs voice is untouched. */
  async unlinkImportedVoice(id: string): Promise<Voice> {
    return this.executeWithErrorHandling(
      `DELETE /voices/imported/${id}`,
      this.instance
        .delete<JsonApiResponseDocument>(`/imported/${id}`)
        .then((res) => this.mapOne(res.data)),
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
