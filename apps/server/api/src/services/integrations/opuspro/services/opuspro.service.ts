import { ConfigService } from '@api/config/config.service';
import { ApiKeyHelperService } from '@api/services/api-key/api-key-helper.service';
import { ApiKeyCategory } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class OpusProService {
  private readonly constructorName: string = String(this.constructor.name);

  private readonly endpoint = 'https://api.opus.pro';
  private readonly callbackUrl: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
    private readonly httpService: HttpService,
    private readonly apiKeyHelperService: ApiKeyHelperService,
  ) {
    this.callbackUrl = `${this.configService.get('GENFEEDAI_WEBHOOKS_URL')}/v1/webhooks/opuspro/callback`;
  }

  private getApiKey(): string {
    return this.apiKeyHelperService.getApiKey(ApiKeyCategory.OPUS_PRO);
  }

  private readObjectRecord(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null
      ? (value as Record<string, unknown>)
      : {};
  }

  private readString(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }

  private getHeaders(apiKey: string) {
    return {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    };
  }

  public async generateVideo(
    metadataId: string,
    templateId: string,
    params: Record<string, unknown>,
    _organizationId?: string,
    _userId?: string,
  ): Promise<string> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      this.loggerService.log(`${url} started`, {
        metadataId,
        templateId,
      });

      const apiKey = this.getApiKey();

      const res = await firstValueFrom(
        this.httpService.post(
          `${this.endpoint}/v1/video/generate`,
          {
            callback_id: metadataId,
            callbackUrl: this.callbackUrl,
            params,
            templateId,
          },
          {
            headers: this.getHeaders(apiKey),
          },
        ),
      );

      if (res.status !== 200 && res.status !== 201) {
        throw new Error('Opus Pro API returned non-success status');
      }

      return res.data?.videoId || res.data?.id;
    } catch (error: unknown) {
      this.loggerService.error(`${url} error`, error);
      throw error;
    }
  }

  public async getVideoStatus(
    videoId: string,
    _organizationId?: string,
    _userId?: string,
  ): Promise<{
    status: string;
    videoUrl?: string;
    progress?: number;
    error?: string;
  }> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      this.loggerService.log(`${url} started`, { videoId });

      const apiKey = this.getApiKey();

      const res = await firstValueFrom(
        this.httpService.get(`${this.endpoint}/v1/video/${videoId}`, {
          headers: this.getHeaders(apiKey),
        }),
      );

      if (res.status !== 200) {
        throw new Error('Opus Pro API returned non-200 status');
      }

      return {
        error: res.data?.error,
        progress: res.data?.progress,
        status: res.data?.status,
        videoUrl: res.data?.videoUrl || res.data?.video_url,
      };
    } catch (error: unknown) {
      this.loggerService.error(`${url} error`, error);
      throw error;
    }
  }

  public async getTemplates(
    _organizationId?: string,
    _userId?: string,
  ): Promise<
    Array<{
      templateId: string;
      name: string;
      description?: string;
      preview?: string;
    }>
  > {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      this.loggerService.log(`${url} started`);

      const apiKey = this.getApiKey();

      const res = await firstValueFrom(
        this.httpService.get(`${this.endpoint}/v1/templates`, {
          headers: this.getHeaders(apiKey),
        }),
      );

      if (res.status !== 200) {
        throw new Error('Opus Pro API returned non-200 status');
      }

      const templates = res.data?.templates || res.data?.data || [];
      return Array.isArray(templates)
        ? templates.flatMap((template) => {
            const record = this.readObjectRecord(template);
            const templateId =
              this.readString(record.templateId) ??
              this.readString(record.template_id) ??
              this.readString(record.id);

            if (!templateId) {
              return [];
            }

            return [
              {
                description: this.readString(record.description),
                name:
                  this.readString(record.name) ??
                  this.readString(record.title) ??
                  'Untitled template',
                preview:
                  this.readString(record.preview_url) ??
                  this.readString(record.preview) ??
                  this.readString(record.thumbnail),
                templateId,
              },
            ];
          })
        : [];
    } catch (error: unknown) {
      this.loggerService.error(`${url} error`, error);
      throw error;
    }
  }

  public async getAccountInfo(
    _organizationId?: string,
    _userId?: string,
  ): Promise<{
    plan?: string;
    credits?: number;
    email?: string;
  }> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      this.loggerService.log(`${url} started`);

      const apiKey = this.getApiKey();

      const res = await firstValueFrom(
        this.httpService.get(`${this.endpoint}/v1/account`, {
          headers: this.getHeaders(apiKey),
        }),
      );

      if (res.status !== 200) {
        throw new Error('Opus Pro API returned non-200 status');
      }

      return {
        credits: res.data?.credits,
        email: res.data?.email,
        plan: res.data?.plan,
      };
    } catch (error: unknown) {
      this.loggerService.error(`${url} error`, error);
      throw error;
    }
  }
}
