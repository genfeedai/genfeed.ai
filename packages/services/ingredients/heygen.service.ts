import { VoiceProvider } from '@genfeedai/contracts';
import { API_ENDPOINTS } from '@genfeedai/contracts/constants';
import type {
  AvatarGenerationQuote,
  HeyGenAvatarCatalogPage,
  HeyGenAvatarVideoRequest,
  HeyGenCatalogAvatar,
  HeyGenCatalogVoice,
  HeyGenSpeechVoiceCatalog,
  IHeyGen,
} from '@genfeedai/contracts/interfaces';
import type { IHttpRequestOptions } from '@genfeedai/contracts/interfaces/utils/http-request-options.interface';
import { HeyGen } from '@genfeedai/models/integrations/heygen.model';
import { readRecord, readString } from '@genfeedai/utils/data/extract.util';
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
    super(API_ENDPOINTS.HEYGEN, token, HeyGen);
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

  async fetchAvatarPage(options: {
    ownership: 'public' | 'private';
    cursor?: string;
    signal?: AbortSignal;
  }): Promise<HeyGenAvatarCatalogPage> {
    const config: AxiosRequestConfig & IHttpRequestOptions = {
      handledErrorStatuses: [500, 502, 503, 504],
      signal: options.signal,
      params: {
        ownership: options.ownership,
        ...(options.cursor ? { cursor: options.cursor } : {}),
      },
    };
    const response = await this.instance.get<{
      data: { attributes: HeyGenAvatarCatalogPage };
    }>(
      `${EnvironmentService.apiEndpoint}${API_ENDPOINTS.HEYGEN}/avatars/page`,
      config,
    );
    return response.data.data.attributes;
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

  /**
   * HeyGen Voice (TTS) voices: the workspace's own ACTIVE clones, listed
   * only when it has connected its own HeyGen account. Distinct from `fetchVoices`, which lists the stock
   * catalog voices avatar video uses.
   */
  async fetchSpeechVoices(
    signal?: AbortSignal,
  ): Promise<HeyGenSpeechVoiceCatalog> {
    const config: AxiosRequestConfig & IHttpRequestOptions = {
      handledErrorStatuses: [500, 502, 503, 504],
      signal,
    };
    const response = await this.instance.get<{
      data: { attributes: HeyGenSpeechVoiceCatalog };
    }>(
      `${EnvironmentService.apiEndpoint}${API_ENDPOINTS.HEYGEN}/speech-voices`,
      config,
    );
    const { hasPersonalConnection, voices } = response.data.data.attributes;
    return { hasPersonalConnection: Boolean(hasPersonalConnection), voices };
  }

  async generate(payload: HeyGenAvatarVideoRequest): Promise<IHeyGen> {
    const response = await this.instance.post<IHeyGen>(
      `${EnvironmentService.apiEndpoint}${API_ENDPOINTS.VIDEOS}/avatar`,
      toAvatarVideoBody(payload),
    );
    return response.data;
  }

  /**
   * The credits `generate` would hold for the same payload, without holding
   * them. An admission refusal rejects; the composer shows it as a failed
   * price check and Generate surfaces the real reason.
   */
  async quote(
    payload: HeyGenAvatarVideoRequest,
    signal?: AbortSignal,
  ): Promise<AvatarGenerationQuote> {
    const config: AxiosRequestConfig & IHttpRequestOptions = {
      handledErrorStatuses: [400, 409, 429, 500, 502, 503, 504],
      signal,
    };
    const response = await this.instance.post<unknown>(
      `${EnvironmentService.apiEndpoint}${API_ENDPOINTS.VIDEOS}/avatar/quote`,
      toAvatarVideoBody(payload),
      config,
    );
    return parseAvatarGenerationQuote(response.data);
  }
}

/** `voiceId` + `voiceProvider` become the provider-specific field the API reads. */
function toAvatarVideoBody(
  payload: HeyGenAvatarVideoRequest,
): Record<string, unknown> {
  const { voiceId, voiceProvider, ...rest } = payload;
  const body: Record<string, unknown> = { ...rest };
  if (voiceId && !rest.voiceRef) {
    if (voiceProvider?.toUpperCase() === VoiceProvider.HEYGEN)
      body.heygenVoiceId = voiceId;
    else if (voiceProvider?.toUpperCase() === VoiceProvider.ELEVENLABS)
      body.elevenlabsVoiceId = voiceId;
    else throw new Error('Choose a voice with its provider before generating.');
  }
  return body;
}

function parseAvatarGenerationQuote(document: unknown): AvatarGenerationQuote {
  const attributes = readRecord(
    readRecord(readRecord(document).data).attributes,
  );
  const { billingMode, credits } = attributes;
  const estimatedSeconds = attributes.estimatedSeconds ?? null;
  const modelKey = readString(attributes.modelKey);
  if (
    (billingMode !== 'byok' && billingMode !== 'platform') ||
    typeof credits !== 'number' ||
    !Number.isSafeInteger(credits) ||
    credits < 0 ||
    !modelKey ||
    (estimatedSeconds !== null &&
      (typeof estimatedSeconds !== 'number' ||
        !Number.isFinite(estimatedSeconds) ||
        estimatedSeconds <= 0))
  )
    throw new Error('Avatar quote response is malformed');
  return { billingMode, credits, estimatedSeconds, modelKey };
}
