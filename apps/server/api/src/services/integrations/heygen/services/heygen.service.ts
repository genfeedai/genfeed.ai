import { randomUUID } from 'node:crypto';
import type { AvatarVideoAspectRatio } from '@api/collections/videos/dto/create-avatar-video.dto';
import { ApiKeyHelperService } from '@api/services/api-key/api-key-helper.service';
import { ByokService } from '@api/services/byok/byok.service';
import { HeyGenSubmissionRejectedError } from '@api/services/integrations/heygen/errors/heygen-submission-rejected.error';
import {
  buildHeyGenVideoCreateBody,
  HEYGEN_API_ORIGIN,
  HEYGEN_VIDEO_CREATE_PATH,
  HEYGEN_VIDEO_POLL_INTERVAL_MS,
  HEYGEN_VIDEO_POLL_TIMEOUT_MS,
  type HeyGenVideoCreateBody,
  heyGenVideoStatusUrl,
  isHeyGenVideoTerminal,
  readHeyGenVideoId,
  readHeyGenVideoStatus,
} from '@api/services/integrations/heygen/helpers/heygen-video';
import { PollTimeoutException } from '@api/shared/services/poll-until/poll-until.exception';
import { PollUntilService } from '@api/shared/services/poll-until/poll-until.service';
import { ApiKeyCategory, ByokProvider } from '@genfeedai/contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { HttpService } from '@nestjs/axios';
import { BadRequestException, Injectable } from '@nestjs/common';
import { isAxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';
import { z } from 'zod';

const catalogPageSchema = z.object({
  data: z.array(z.record(z.string(), z.unknown())),
  has_more: z.boolean(),
  next_token: z.string().nullable(),
});
const voiceSchema = z.object({
  voice_id: z.string().trim().min(1),
  name: z.string(),
  preview_audio_url: z.string().nullish(),
});
const lookSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string(),
  preview_image_url: z.string().nullish(),
});

type HeyGenSpeechInput =
  | string
  | {
      audioUrl?: string;
      inputText?: string;
      voiceId?: string;
    };

@Injectable()
export class HeyGenService {
  private readonly constructorName: string = String(this.constructor.name);
  private readonly endpoint = `${HEYGEN_API_ORIGIN}/v3`;

  constructor(
    private readonly loggerService: LoggerService,
    private readonly httpService: HttpService,
    private readonly apiKeyHelperService: ApiKeyHelperService,
    private readonly pollUntilService: PollUntilService,
    private readonly byokService: ByokService,
  ) {}

  private getApiKey(): string {
    return this.apiKeyHelperService.getApiKey(ApiKeyCategory.HEYGEN);
  }

  private async resolveCredential(
    apiKeyOverride?: string,
    organizationId?: string,
  ) {
    if (apiKeyOverride) return { apiKey: apiKeyOverride, hasCustomKey: true };
    if (organizationId) {
      const credential = await this.byokService.resolveApiKey(
        organizationId,
        ByokProvider.HEYGEN,
      );
      if (credential) return { apiKey: credential.apiKey, hasCustomKey: true };
    }
    return { apiKey: this.getApiKey(), hasCustomKey: false };
  }

  private async resolveApiKey(
    apiKeyOverride?: string,
    organizationId?: string,
  ): Promise<string> {
    return (await this.resolveCredential(apiKeyOverride, organizationId))
      .apiKey;
  }

  private getHeaders(apiKey: string) {
    return { 'Content-Type': 'application/json', 'X-Api-Key': apiKey };
  }

  public async generateAvatarVideo(
    metadataId: string,
    avatarId: string,
    voiceId: string,
    inputText: string,
    organizationId?: string,
    _userId?: string,
    apiKeyOverride?: string,
  ): Promise<string> {
    if (!avatarId.trim() || !voiceId.trim() || !inputText.trim()) {
      throw new BadRequestException('Avatar, voice and script are required');
    }
    const apiKey = await this.resolveApiKey(apiKeyOverride, organizationId);
    return this.submitAvatarVideo(apiKey, {
      type: 'avatar',
      avatar_id: avatarId,
      script: inputText,
      voice_id: voiceId,
      aspect_ratio: '16:9',
      resolution: '720p',
      callback_id: metadataId,
    });
  }

  /** Animate an image directly; trained avatar looks use generateAvatarVideo. */
  public async generatePhotoAvatarVideo(
    metadataId: string,
    photoUrl: string,
    voiceInput: HeyGenSpeechInput,
    organizationId?: string,
    _userId?: string,
    apiKeyOverride?: string,
    aspectRatio: AvatarVideoAspectRatio = '9:16',
  ): Promise<string> {
    const speech =
      typeof voiceInput === 'string' ? { audioUrl: voiceInput } : voiceInput;
    const audioUrl = speech.audioUrl?.trim();
    if (!photoUrl.trim())
      throw new BadRequestException('A photo URL is required');
    if (!audioUrl && (!speech.voiceId?.trim() || !speech.inputText?.trim())) {
      throw new BadRequestException(
        'Either audioUrl or voiceId with inputText is required for photo avatar generation',
      );
    }
    const apiKey = await this.resolveApiKey(apiKeyOverride, organizationId);
    return this.submitAvatarVideo(apiKey, {
      type: 'image',
      image: { type: 'url', url: photoUrl },
      ...(audioUrl
        ? { audio_url: audioUrl }
        : { script: speech.inputText, voice_id: speech.voiceId }),
      aspect_ratio: aspectRatio,
      resolution: aspectRatio === '1:1' ? '1080p' : '720p',
      callback_id: metadataId,
    });
  }

  private async submitAvatarVideo(
    apiKey: string,
    body: Record<string, unknown>,
  ): Promise<string> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    try {
      // Never automatically retry an ambiguous paid submission.
      const response = await firstValueFrom(
        this.httpService.post<unknown>(`${this.endpoint}/videos`, body, {
          headers: {
            ...this.getHeaders(apiKey),
            'Idempotency-Key': randomUUID(),
          },
          timeout: 30_000,
        }),
      );
      if (response.status === 402) throw new HeyGenSubmissionRejectedError();
      if (response.status !== 200)
        throw new Error('HeyGen API returned non-200 status');
      const videoId = readHeyGenVideoId(response.data);
      if (!videoId)
        throw new Error('HeyGen submission returned no operation identity');
      return videoId;
    } catch (error: unknown) {
      this.loggerService.error(`${caller} error`, error);
      if (isAxiosError(error) && error.response?.status === 402)
        throw new HeyGenSubmissionRejectedError();
      throw error;
    }
  }

  public async getVoices(
    organizationId?: string,
    _userId?: string,
    apiKeyOverride?: string,
  ): Promise<
    Array<{ preview: string; name: string; index: number; voiceId: string }>
  > {
    const { apiKey, hasCustomKey } = await this.resolveCredential(
      apiKeyOverride,
      organizationId,
    );
    // Global reference catalogs contain public voices only. Connected accounts
    // also expose their private voices, under the same resolved credential.
    const voices = await this.getCatalog('/voices', apiKey, 100, {
      type: 'public',
    });
    if (hasCustomKey)
      voices.push(
        ...(await this.getCatalog('/voices', apiKey, 100, { type: 'private' })),
      );
    return voices.map((item, index) => {
      const voice = voiceSchema.parse(item);
      return {
        index,
        name: voice.name,
        preview: voice.preview_audio_url ?? '',
        voiceId: voice.voice_id,
      };
    });
  }

  public async getAvatars(
    organizationId?: string,
    _userId?: string,
    apiKeyOverride?: string,
  ): Promise<
    Array<{ preview: string; name: string; index: number; avatarId: string }>
  > {
    const { apiKey, hasCustomKey } = await this.resolveCredential(
      apiKeyOverride,
      organizationId,
    );
    const looks = await this.getCatalog(
      '/avatars/looks',
      apiKey,
      50,
      hasCustomKey ? {} : { ownership: 'public' },
    );
    return looks.map((item, index) => {
      const look = lookSchema.parse(item);
      return {
        avatarId: look.id,
        index,
        name: look.name,
        preview: look.preview_image_url ?? '',
      };
    });
  }

  public async getConnectionStatus(
    organizationId?: string,
  ): Promise<{ hasCustomKey: boolean; isConnected: boolean }> {
    const { apiKey, hasCustomKey } = await this.resolveCredential(
      undefined,
      organizationId,
    );
    await firstValueFrom(
      this.httpService.get(`${this.endpoint}/users/me`, {
        headers: this.getHeaders(apiKey),
        timeout: 15_000,
      }),
    );
    return { hasCustomKey, isConnected: true };
  }

  private async getCatalog(
    path: string,
    apiKey: string,
    limit: number,
    filters: Record<string, string> = {},
  ): Promise<Record<string, unknown>[]> {
    const items: Record<string, unknown>[] = [];
    const seenTokens = new Set<string>();
    let token: string | undefined;
    for (let page = 0; page < 100; page++) {
      const response = await firstValueFrom(
        this.httpService.get<unknown>(`${this.endpoint}${path}`, {
          headers: this.getHeaders(apiKey),
          params: { ...filters, limit, ...(token ? { token } : {}) },
          timeout: 15_000,
        }),
      );
      if (response.status !== 200)
        throw new Error('HeyGen API returned non-200 status');
      const data = catalogPageSchema.parse(response.data);
      items.push(...data.data);
      if (!data.has_more) return items;
      if (!data.next_token || seenTokens.has(data.next_token))
        throw new Error('HeyGen returned an invalid catalog cursor');
      token = data.next_token;
      seenTokens.add(token);
    }
    throw new Error('HeyGen catalog exceeded the pagination limit');
  }

  /**
   * HeyGen Video (`heygen-video-1`) on `POST /v3/models/videos`.
   * Polls until the signed `video_url` is ready. Prompt enhancement stays
   * off so the compiled brief is not rewritten.
   */
  public async generateModelVideo(params: {
    apiKeyOverride?: string;
    aspectRatio?: string;
    duration?: number;
    imageUrls?: readonly string[];
    onProviderSubmissionStarted?: () => void;
    prompt: string;
    resolution?: string;
    seed?: number;
    videoUrls?: readonly string[];
  }): Promise<{ videoUrl: string }> {
    const apiKey = await this.resolveApiKey(params.apiKeyOverride);
    const body = this.buildModelVideoBody(params);
    const videoId = await this.submitModelVideo(
      apiKey,
      body,
      params.onProviderSubmissionStarted,
    );
    return this.waitForModelVideo(videoId, apiKey);
  }

  private buildModelVideoBody(params: {
    aspectRatio?: string;
    duration?: number;
    imageUrls?: readonly string[];
    prompt: string;
    resolution?: string;
    seed?: number;
    videoUrls?: readonly string[];
  }): HeyGenVideoCreateBody {
    try {
      return buildHeyGenVideoCreateBody({
        aspectRatio: params.aspectRatio,
        duration: params.duration,
        imageUrls: params.imageUrls ?? [],
        prompt: params.prompt,
        resolution: params.resolution,
        seed: params.seed,
        videoUrls: params.videoUrls ?? [],
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : 'Invalid HeyGen Video request.';
      throw new BadRequestException(message);
    }
  }

  private async submitModelVideo(
    apiKey: string,
    body: HeyGenVideoCreateBody,
    onProviderSubmissionStarted?: () => void,
  ): Promise<string> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    try {
      onProviderSubmissionStarted?.();
      const response = await firstValueFrom(
        this.httpService.post(
          `${HEYGEN_API_ORIGIN}${HEYGEN_VIDEO_CREATE_PATH}`,
          body,
          {
            headers: {
              ...this.getHeaders(apiKey),
              'Idempotency-Key': randomUUID(),
            },
          },
        ),
      );
      const videoId = readHeyGenVideoId(response.data);
      if (!videoId) {
        throw new Error('HeyGen Video submission returned no video id.');
      }
      this.loggerService.log(`${caller} submitted ${videoId}`);
      return videoId;
    } catch (error: unknown) {
      if (isAxiosError(error) && error.response?.status === 402) {
        throw new HeyGenSubmissionRejectedError();
      }
      if (error instanceof HeyGenSubmissionRejectedError) {
        throw error;
      }
      this.loggerService.error(`${caller} error`, error);
      throw error;
    }
  }

  private async waitForModelVideo(
    videoId: string,
    apiKey: string,
  ): Promise<{ videoUrl: string }> {
    try {
      const { value } = await this.pollUntilService.poll(
        () => this.readModelVideo(videoId, apiKey),
        (status) => isHeyGenVideoTerminal(status.status),
        {
          intervalMs: HEYGEN_VIDEO_POLL_INTERVAL_MS,
          timeoutMs: HEYGEN_VIDEO_POLL_TIMEOUT_MS,
        },
      );
      if (value.status === 'completed' && value.videoUrl) {
        return { videoUrl: value.videoUrl };
      }
      throw new Error(
        value.failureMessage ||
          `HeyGen Video ${videoId} ended as ${value.status}.`,
      );
    } catch (error: unknown) {
      if (error instanceof PollTimeoutException) {
        throw new Error(
          `HeyGen Video ${videoId} timed out after ${error.timeoutMs}ms.`,
        );
      }
      throw error;
    }
  }

  private async readModelVideo(videoId: string, apiKey: string) {
    try {
      const response = await firstValueFrom(
        this.httpService.get(heyGenVideoStatusUrl(videoId), {
          headers: this.getHeaders(apiKey),
        }),
      );
      return readHeyGenVideoStatus(response.data);
    } catch (error: unknown) {
      const statusCode = isAxiosError(error)
        ? error.response?.status
        : undefined;
      if (statusCode !== undefined && statusCode < 500) {
        throw error;
      }
      return { status: 'pending' };
    }
  }
}
