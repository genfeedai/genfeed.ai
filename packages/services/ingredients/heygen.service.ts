import { VoiceProvider } from '@genfeedai/contracts';
import { API_ENDPOINTS } from '@genfeedai/contracts/constants';
import type {
  HeyGenAvatarRef,
  HeyGenCatalogAvatar,
  HeyGenCatalogVoice,
  IBrandAgentConfig,
  IHeyGen,
} from '@genfeedai/contracts/interfaces';
import type { IHttpRequestOptions } from '@genfeedai/contracts/interfaces/utils/http-request-options.interface';
import { HeyGen } from '@genfeedai/models/integrations/heygen.model';
import { BaseService } from '@services/core/base.service';
import { EnvironmentService } from '@services/core/environment.service';
import type { AxiosRequestConfig } from 'axios';

/**
 * HeyGen Service - For fetching avatars/voices and generating avatar videos
 * Note: Voices and avatars are stored as ingredients in the DB
 * Use IngredientsService or VoicesService/AvatarsService to fetch them
 *
 * Generation: POST /videos/avatar (AvatarVideoController on backend)
 */

export class HeyGenService extends BaseService<IHeyGen> {
  constructor(token: string) {
    super(API_ENDPOINTS.HEYGEN, token, HeyGen, { serialize: (d) => d });
  }

  public static getInstance(token: string): HeyGenService {
    return BaseService.getDataServiceInstance(HeyGenService, token);
  }

  async fetchAvatars(signal?: AbortSignal): Promise<HeyGenCatalogAvatar[]> {
    const config: AxiosRequestConfig & IHttpRequestOptions = {
      handledErrorStatuses: [500, 502, 503, 504],
      signal,
    };
    const response = await this.instance.get<{
      data: { attributes: { avatars: HeyGenCatalogAvatar[] } };
    }>(
      `${EnvironmentService.apiEndpoint}${API_ENDPOINTS.HEYGEN}/avatars`,
      config,
    );
    return response.data.data.attributes.avatars;
  }

  async fetchVoices(signal?: AbortSignal): Promise<HeyGenCatalogVoice[]> {
    const config: AxiosRequestConfig & IHttpRequestOptions = {
      handledErrorStatuses: [500, 502, 503, 504],
      signal,
    };
    const response = await this.instance.get<{
      data: { attributes: { voices: HeyGenCatalogVoice[] } };
    }>(
      `${EnvironmentService.apiEndpoint}${API_ENDPOINTS.HEYGEN}/voices`,
      config,
    );
    return response.data.data.attributes.voices;
  }

  async generate(payload: {
    useIdentity?: boolean;
    voiceId?: string;
    voiceProvider?: string;
    voiceRef?: IBrandAgentConfig['defaultVoiceRef'];
    avatarId?: string;
    avatarRef?: HeyGenAvatarRef;
    photoUrl?: string;
    text: string;
    audioUrl?: string;
    audioIngredientId?: string;
    elevenlabsVoiceId?: string;
    heygenVoiceId?: string;
  }): Promise<IHeyGen> {
    const { voiceId, voiceProvider, ...rest } = payload;
    const backendPayload: Record<string, unknown> = { ...rest };
    if (voiceId && !rest.voiceRef) {
      if (voiceProvider?.toUpperCase() === VoiceProvider.HEYGEN)
        backendPayload.heygenVoiceId = voiceId;
      else if (voiceProvider?.toUpperCase() === VoiceProvider.ELEVENLABS)
        backendPayload.elevenlabsVoiceId = voiceId;
      else
        throw new Error('Choose a voice with its provider before generating.');
    }
    const avatarUrl = `${EnvironmentService.apiEndpoint}${API_ENDPOINTS.VIDEOS}/avatar`;
    const response = await this.instance.post<IHeyGen>(
      avatarUrl,
      backendPayload,
    );
    return response.data;
  }
}
