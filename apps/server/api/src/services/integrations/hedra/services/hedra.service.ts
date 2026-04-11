import { ConfigService } from '@api/config/config.service';
import { ApiKeyHelperService } from '@api/services/api-key/api-key-helper.service';
import { ApiKeyCategory } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class HedraService {
  private readonly constructorName: string = String(this.constructor.name);
  private readonly endpoint: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
    private readonly httpService: HttpService,
    private readonly apiKeyHelperService: ApiKeyHelperService,
  ) {
    this.endpoint =
      this.configService.get('HEDRA_URL') ?? 'https://api.hedra.com/v1';
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private getApiKey(): string {
    return this.apiKeyHelperService.getApiKey(ApiKeyCategory.HEDRA);
  }

  private resolveApiKey(apiKeyOverride?: string): string {
    return apiKeyOverride || this.getApiKey();
  }

  private getHeaders(apiKey: string): {
    'X-API-Key': string;
    'Content-Type': string;
  } {
    return {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
    };
  }

  public async generateCharacterVideo(
    metadataId: string,
    audioUrl: string,
    imageUrl: string,
    aspectRatio: string = '16:9',
    _organizationId?: string | Types.ObjectId,
    _userId?: string | Types.ObjectId,
    apiKeyOverride?: string,
  ): Promise<string> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      this.loggerService.log(`${url} started`, {
        aspectRatio,
        metadataId,
      });

      const apiKey = this.resolveApiKey(apiKeyOverride);
      const callbackUrl = `${this.configService.get('GENFEEDAI_WEBHOOKS_URL')}/v1/webhooks/hedra/callback`;

      const res = await firstValueFrom(
        this.httpService.post(
          `${this.endpoint}/generate/character`,
          {
            aspect_ratio: aspectRatio,
            audio_url: audioUrl,
            callback_url: callbackUrl,
            image_url: imageUrl,
            metadata: {
              id: metadataId,
            },
          },
          {
            headers: this.getHeaders(apiKey),
          },
        ),
      );

      if (res.status !== 200 && res.status !== 201) {
        throw new Error('Hedra API returned non-success status');
      }

      return res.data?.job_id || res.data?.id;
    } catch (error: unknown) {
      this.loggerService.error(`${url} error`, error);
      throw error;
    }
  }

  public async generateCharacterWithText(
    metadataId: string,
    text: string,
    imageUrl: string,
    voiceId?: string,
    aspectRatio: string = '16:9',
    _organizationId?: string | Types.ObjectId,
    _userId?: string | Types.ObjectId,
    apiKeyOverride?: string,
  ): Promise<string> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      this.loggerService.log(`${url} started`, {
        aspectRatio,
        metadataId,
        voiceId,
      });

      const apiKey = this.resolveApiKey(apiKeyOverride);
      const callbackUrl = `${this.configService.get('GENFEEDAI_WEBHOOKS_URL')}/v1/webhooks/hedra/callback`;

      const payload: Record<string, unknown> = {
        aspect_ratio: aspectRatio,
        callback_url: callbackUrl,
        image_url: imageUrl,
        metadata: {
          id: metadataId,
        },
        text,
      };

      // Add voice ID if provided, otherwise Hedra will use default
      if (voiceId) {
        payload.voice_id = voiceId;
      }

      const res = await firstValueFrom(
        this.httpService.post(
          `${this.endpoint}/generate/character-text`,
          payload,
          {
            headers: this.getHeaders(apiKey),
          },
        ),
      );

      if (res.status !== 200 && res.status !== 201) {
        throw new Error('Hedra API returned non-success status');
      }

      return res.data?.job_id || res.data?.id;
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
    Array<{
      id: string;
      name: string;
      gender?: string;
      language?: string;
      provider: string;
      preview?: string;
    }>
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
        throw new Error('Hedra API returned non-200 status');
      }

      const voices = (res.data?.voices || res.data?.data || []) as unknown[];

      return voices.map((v: unknown) => ({
        gender: this.isRecord(v) ? (v.gender as string | undefined) : undefined,
        id: this.isRecord(v) ? ((v.voice_id || v.id) as string) : '',
        language: this.isRecord(v)
          ? (v.language as string | undefined) || 'en-US'
          : 'en-US',
        name: this.isRecord(v) ? ((v.voice_name || v.name) as string) : '',
        preview: this.isRecord(v)
          ? ((v.preview_url || v.preview) as string | undefined)
          : undefined,
        provider: 'hedra',
      }));
    } catch (error: unknown) {
      this.loggerService.error(`${url} error`, error);
      throw error;
    }
  }

  public async getJobStatus(
    jobId: string,
    _organizationId?: string | Types.ObjectId,
    _userId?: string | Types.ObjectId,
    apiKeyOverride?: string,
  ): Promise<{
    status: string;
    video_url?: string;
    error?: string;
  }> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      this.loggerService.log(`${url} started`, { jobId });

      const apiKey = this.resolveApiKey(apiKeyOverride);

      const res = await firstValueFrom(
        this.httpService.get(`${this.endpoint}/jobs/${jobId}`, {
          headers: this.getHeaders(apiKey),
        }),
      );

      if (res.status !== 200) {
        throw new Error('Hedra API returned non-200 status');
      }

      return {
        error: res.data?.error,
        status: res.data?.status,
        video_url: res.data?.video_url,
      };
    } catch (error: unknown) {
      this.loggerService.error(`${url} error`, error);
      throw error;
    }
  }

  public async createLiveAvatar(
    name: string,
    imageUrl: string,
    _organizationId?: string | Types.ObjectId,
    _userId?: string | Types.ObjectId,
    apiKeyOverride?: string,
  ): Promise<string> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      this.loggerService.log(`${url} started`, { name });

      const apiKey = this.resolveApiKey(apiKeyOverride);

      const res = await firstValueFrom(
        this.httpService.post(
          `${this.endpoint}/avatars/create`,
          {
            image_url: imageUrl,
            name,
            type: 'realtime',
          },
          {
            headers: this.getHeaders(apiKey),
          },
        ),
      );

      if (res.status !== 200 && res.status !== 201) {
        throw new Error('Hedra API returned non-success status');
      }

      return res.data?.avatar_id || res.data?.id;
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
    Array<{
      id: string;
      name: string;
      type: string;
      preview?: string;
    }>
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
        throw new Error('Hedra API returned non-200 status');
      }

      const avatars = (res.data?.avatars || res.data?.data || []) as unknown[];

      return avatars.map((a: unknown) => ({
        id: this.isRecord(a) ? ((a.avatar_id || a.id) as string) : '',
        name: this.isRecord(a) ? ((a.avatar_name || a.name) as string) : '',
        preview: this.isRecord(a)
          ? ((a.preview_url || a.preview) as string | undefined)
          : undefined,
        type: this.isRecord(a)
          ? (a.type as string | undefined) || 'custom'
          : 'custom',
      }));
    } catch (error: unknown) {
      this.loggerService.error(`${url} error`, error);
      throw error;
    }
  }
}
