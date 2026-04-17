import { AvatarVideoAspectRatio } from '@api/collections/videos/dto/create-avatar-video.dto';
import { ConfigService } from '@api/config/config.service';
import { ApiKeyHelperService } from '@api/services/api-key/api-key-helper.service';
import { ApiKeyCategory } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

type HeyGenApiRecord = Record<string, unknown>;

@Injectable()
export class HeyGenService {
  private readonly constructorName: string = String(this.constructor.name);

  private readonly endpoint = 'https://api.heygen.com/v2';
  private readonly callbackUrl: string;

  constructor(
    _configService: ConfigService,
    private readonly loggerService: LoggerService,
    private readonly httpService: HttpService,
    private readonly apiKeyHelperService: ApiKeyHelperService,
  ) {
    this.callbackUrl = `${process.env.GENFEEDAI_WEBHOOKS_URL ?? ''}/v1/webhooks/heygen/callback`;
  }

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
    _organizationId?: string | Types.ObjectId,
    _userId?: string | Types.ObjectId,
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
            callback_url: this.callbackUrl,
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
    _organizationId?: string | Types.ObjectId,
    _userId?: string | Types.ObjectId,
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
            callback_url: this.callbackUrl,
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

      if (res.status !== 200) {
        throw new Error('HeyGen API returned non-200 status');
      }

      return res.data.data?.video_id || res.data.data?.task_id;
    } catch (error: unknown) {
      this.loggerService.error(`${url} error`, error);
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
    _organizationId?: string | Types.ObjectId,
    _userId?: string | Types.ObjectId,
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
    _organizationId?: string | Types.ObjectId,
    _userId?: string | Types.ObjectId,
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
    _organizationId?: string | Types.ObjectId,
    _userId?: string | Types.ObjectId,
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
}
