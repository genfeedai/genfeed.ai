import { randomUUID } from 'node:crypto';
import process from 'node:process';
import { AvatarVideoAspectRatio } from '@api/collections/videos/dto/create-avatar-video.dto';
import { ApiKeyHelperService } from '@api/services/api-key/api-key-helper.service';
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
import { ApiKeyCategory } from '@genfeedai/contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { HttpService } from '@nestjs/axios';
import { BadRequestException, Injectable } from '@nestjs/common';
import { isAxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';

type HeyGenApiRecord = Record<string, unknown>;

@Injectable()
export class HeyGenService {
  private readonly constructorName: string = String(this.constructor.name);

  private readonly endpoint = 'https://api.heygen.com/v2';

  constructor(
    private readonly loggerService: LoggerService,
    private readonly httpService: HttpService,
    private readonly apiKeyHelperService: ApiKeyHelperService,
    private readonly pollUntilService: PollUntilService,
  ) {}

  private getApiKey(): string {
    return this.apiKeyHelperService.getApiKey(ApiKeyCategory.HEYGEN);
  }

  private resolveApiKey(apiKeyOverride?: string): string {
    return apiKeyOverride || this.getApiKey();
  }

  private getHeaders(apiKey: string) {
    return {
      'Content-Type': 'application/json',
      'X-Api-Key': apiKey,
    };
  }

  public async generateAvatarVideo(
    metadataId: string,
    avatarId: string,
    voiceId: string,
    inputText: string,
    _organizationId?: string,
    _userId?: string,
    apiKeyOverride?: string,
  ): Promise<string> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      this.loggerService.log(`${url} started`, {
        avatarId,
      });

      const apiKey = this.resolveApiKey(apiKeyOverride);

      const res = await firstValueFrom(
        this.httpService.post(
          `${this.endpoint}/video/generate`,
          {
            callback_id: metadataId,
            caption: false,
            dimension: {
              height: 720,
              width: 1280,
            },
            video_inputs: [
              {
                character: {
                  avatar_id: avatarId,
                  avatar_style: 'normal',
                  expression: 'happy',
                  scale: 1,
                  talking_style: 'expressive',
                  type: 'avatar',
                },
                voice: {
                  emotion: 'Excited',
                  input_text: inputText,
                  locale: 'en-US',
                  type: 'text',
                  voice_id: voiceId,
                },
              },
            ],
          },
          {
            headers: this.getHeaders(apiKey),
          },
        ),
      );

      if (res.status !== 200) {
        throw new Error('HeyGen API returned non-200 status');
      }

      return res.data.data?.video_id || res.data.data?.task_id;
    } catch (error: unknown) {
      this.loggerService.error(`${url} error`, error);
      throw error;
    }
  }

  /**
   * Generate photo avatar video using HeyGen Photo Avatar API
   * Supports external audio URLs and direct HeyGen voice IDs.
   */
  public async generatePhotoAvatarVideo(
    metadataId: string,
    photoUrl: string,
    voiceInput:
      | string
      | {
          audioUrl?: string;
          inputText?: string;
          voiceId?: string;
        },
    _organizationId?: string,
    _userId?: string,
    apiKeyOverride?: string,
    aspectRatio: AvatarVideoAspectRatio = '9:16',
  ): Promise<string> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const normalizedVoiceInput =
        typeof voiceInput === 'string' ? { audioUrl: voiceInput } : voiceInput;

      this.loggerService.log(`${url} started`, {
        audioUrl: normalizedVoiceInput.audioUrl,
        photoUrl,
        voiceId: normalizedVoiceInput.voiceId,
      });

      const apiKey = this.resolveApiKey(apiKeyOverride);

      const dimensions = this.getAvatarDimensions(aspectRatio);

      if (!normalizedVoiceInput.audioUrl && !normalizedVoiceInput.voiceId) {
        throw new Error(
          'Either audioUrl or voiceId is required for photo avatar generation',
        );
      }

      const voicePayload = normalizedVoiceInput.audioUrl
        ? {
            audio_url: normalizedVoiceInput.audioUrl,
            type: 'audio',
          }
        : {
            emotion: 'Excited',
            input_text: normalizedVoiceInput.inputText,
            locale: 'en-US',
            type: 'text',
            voice_id: normalizedVoiceInput.voiceId,
          };

      const res = await firstValueFrom(
        this.httpService.post(
          `${this.endpoint}/video/generate`,
          {
            callback_id: metadataId,
            caption: false,
            dimension: dimensions,
            video_inputs: [
              {
                character: {
                  photo_url: photoUrl,
                  type: 'photo_avatar',
                },
                voice: voicePayload,
              },
            ],
          },
          {
            headers: this.getHeaders(apiKey),
          },
        ),
      );

      if (res.status === 402) throw new HeyGenSubmissionRejectedError();
      if (res.status !== 200) {
        throw new Error('HeyGen API returned non-200 status');
      }

      const externalId: unknown =
        res.data.data?.video_id || res.data.data?.task_id;
      if (typeof externalId !== 'string' || !externalId.trim()) {
        throw new Error('HeyGen submission returned no operation identity');
      }
      return externalId;
    } catch (error: unknown) {
      this.loggerService.error(`${url} error`, error);
      if (isAxiosError(error) && error.response?.status === 402) {
        throw new HeyGenSubmissionRejectedError();
      }
      throw error;
    }
  }

  private getAvatarDimensions(aspectRatio: AvatarVideoAspectRatio): {
    height: number;
    width: number;
  } {
    if (aspectRatio === '16:9') {
      return { height: 720, width: 1280 };
    }

    if (aspectRatio === '1:1') {
      return { height: 1080, width: 1080 };
    }

    return { height: 1280, width: 720 };
  }

  public async createAvatar(
    name: string,
    videoUrl: string,
    _organizationId?: string,
    _userId?: string,
    apiKeyOverride?: string,
  ): Promise<string> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      this.loggerService.log(`${url} started`, {
        name,
      });

      const apiKey = this.resolveApiKey(apiKeyOverride);

      const res = await firstValueFrom(
        this.httpService.post(
          `${this.endpoint}/avatar/create`,
          {
            avatar_name: name,
            test: process.env.NODE_ENV === 'development',
            video_url: videoUrl,
          },
          {
            headers: this.getHeaders(apiKey),
          },
        ),
      );

      if (res.status !== 200) {
        throw new Error('HeyGen API returned non-200 status');
      }

      return res.data.data?.avatar_id || res.data.data?.task_id;
    } catch (error: unknown) {
      this.loggerService.error(`${url} error`, error);
      throw error;
    }
  }

  public async getVoices(
    _organizationId?: string,
    _userId?: string,
    apiKeyOverride?: string,
  ): Promise<
    Array<{ preview: string; name: string; index: number; voiceId: string }>
  > {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      this.loggerService.log(`${url} started`);

      const apiKey = this.resolveApiKey(apiKeyOverride);

      const res = await firstValueFrom(
        this.httpService.get(`${this.endpoint}/voices`, {
          headers: this.getHeaders(apiKey),
        }),
      );

      if (res.status !== 200) {
        throw new Error('HeyGen API returned non-200 status');
      }

      const voices = res.data?.data?.voices || res.data?.data || [];
      return voices.map((voice: unknown, index: number) => {
        const voiceRecord = voice as HeyGenApiRecord;

        return {
          index,
          name:
            String(
              voiceRecord.voice_name ??
                voiceRecord.name ??
                `Voice ${index + 1}`,
            ) || `Voice ${index + 1}`,
          preview: String(voiceRecord.preview_url ?? voiceRecord.preview ?? ''),
          voiceId:
            String(
              voiceRecord.voice_id ?? voiceRecord.id ?? `voice_${index}`,
            ) || `voice_${index}`,
        };
      });
    } catch (error: unknown) {
      this.loggerService.error(`${url} error`, error);
      throw error;
    }
  }

  public async getAvatars(
    _organizationId?: string,
    _userId?: string,
    apiKeyOverride?: string,
  ): Promise<
    Array<{ preview: string; name: string; index: number; avatarId: string }>
  > {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      this.loggerService.log(`${url} started`);

      const apiKey = this.resolveApiKey(apiKeyOverride);

      const res = await firstValueFrom(
        this.httpService.get(`${this.endpoint}/avatars`, {
          headers: this.getHeaders(apiKey),
        }),
      );

      if (res.status !== 200) {
        throw new Error('HeyGen API returned non-200 status');
      }

      const avatars = res.data?.data?.avatars || res.data?.data || [];
      return avatars.map((avatar: unknown, index: number) => {
        const avatarRecord = avatar as HeyGenApiRecord;

        return {
          avatarId:
            String(
              avatarRecord.avatar_id ?? avatarRecord.id ?? `avatar_${index}`,
            ) || `avatar_${index}`,
          index,
          name:
            String(
              avatarRecord.avatar_name ??
                avatarRecord.name ??
                `Avatar ${index + 1}`,
            ) || `Avatar ${index + 1}`,
          preview: String(
            avatarRecord.preview_url ?? avatarRecord.preview ?? '',
          ),
        };
      });
    } catch (error: unknown) {
      this.loggerService.error(`${url} error`, error);
      throw error;
    }
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
    const apiKey = this.resolveApiKey(params.apiKeyOverride);
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
