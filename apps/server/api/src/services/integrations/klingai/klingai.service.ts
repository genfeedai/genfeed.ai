import { ConfigService } from '@api/config/config.service';
import { encodeJwtToken } from '@api/helpers/utils/jwt/jwt.util';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import pLimit from 'p-limit';
import { firstValueFrom } from 'rxjs';

// https://app.klingai.com/global/dev/document-api/apiReference/model/skillsMap.

@Injectable()
export class KlingAIService {
  private readonly constructorName: string = String(this.constructor.name);

  private readonly ratios: Record<string, string> = {
    '1024:1024': '1:1',
    '1080:1920': '9:16',
    '1920:1080': '16:9',
  };

  private readonly endpoint: string = 'https://api.klingai.com/v1';
  private readonly webhookEndpoint: string;
  private readonly ingredientsEndpoint: string;

  private readonly apiKey: string;
  private readonly apiSecret: string;

  private readonly model: string;

  private readonly limit = pLimit(3);

  private readonly callbackUrl: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
    private readonly httpService: HttpService,
  ) {
    this.webhookEndpoint =
      this.configService.get('GENFEEDAI_WEBHOOKS_URL') ?? '';
    this.ingredientsEndpoint = this.configService.ingredientsEndpoint;
    this.apiKey = this.configService.get('KLINGAI_KEY') ?? '';
    this.apiSecret = this.configService.get('KLINGAI_SECRET') ?? '';
    this.model = this.configService.get('KLINGAI_MODEL') ?? '';
    this.callbackUrl = `${this.webhookEndpoint}/v1/webhooks/klingai/callback`;
  }

  private getHeadersWithOverride(credentialsOverride?: {
    apiKey: string;
    apiSecret: string;
  }): { Authorization: string; 'Content-Type': string } {
    const key = credentialsOverride?.apiKey || this.apiKey;
    const secret = credentialsOverride?.apiSecret || this.apiSecret;
    return {
      Authorization: `Bearer ${encodeJwtToken(key, secret)}`,
      'Content-Type': 'application/json',
    };
  }

  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    return this.limit(fn);
  }

  public queueGenerateImage(
    prompt: string,
    options?: {
      model: string;
      width: number;
      height: number;
      style: string;
      reference?: string;
    },
    credentialsOverride?: { apiKey: string; apiSecret: string },
  ) {
    return this.enqueue(() =>
      this.generateImage(prompt, options, credentialsOverride),
    );
  }

  public queueGenerateImageToVideo(
    prompt: string,
    parentId?: string,
    credentialsOverride?: { apiKey: string; apiSecret: string },
  ) {
    return this.enqueue(() =>
      this.generateImageToVideo(
        prompt,
        parentId,
        undefined,
        credentialsOverride,
      ),
    );
  }

  public queueGenerateTextToVideo(
    prompt: string,
    options?: { model: string; width: number; height: number },
    credentialsOverride?: { apiKey: string; apiSecret: string },
  ) {
    return this.enqueue(() =>
      this.generateTextToVideo(prompt, options, credentialsOverride),
    );
  }

  public async generateImage(
    prompt: string,
    options?: {
      model: string;
      width: number;
      height: number;
      style: string;
      reference?: string;
    },
    credentialsOverride?: { apiKey: string; apiSecret: string },
  ) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      this.loggerService.log(`${url} started`);

      const res = await firstValueFrom(
        this.httpService.post(
          `${this.endpoint}/images/generations`,
          {
            aspect_ratio: this.getAspectRatio(options?.width, options?.height),
            callback_url: this.callbackUrl,
            image: options?.reference,
            model: options?.model || this.model,
            n: 1,
            prompt,
          },
          { headers: this.getHeadersWithOverride(credentialsOverride) },
        ),
      );

      if (res.status !== 200) {
        throw new Error('KlingAI API returned non-200 status');
      }

      return res.data.request_id;
    } catch (error: unknown) {
      const axiosError = error as {
        response?: { status?: number; data?: unknown; statusText?: string };
      };
      if (
        axiosError?.response?.status === 401 ||
        axiosError?.response?.status === 403
      ) {
        this.loggerService.error(`${url} unauthorized`, {
          data: axiosError?.response?.data,
          status: axiosError?.response?.status,
        });
        throw new Error('KlingAI authorization failed');
      }

      this.loggerService.error(`${url} failed`, {
        data: axiosError?.response?.data,
        status: axiosError?.response?.status,
        statusText: axiosError?.response?.statusText,
      });
    }
  }

  public async generateImageToVideo(
    prompt: string,
    parentId?: string,
    options?: { model: string },
    credentialsOverride?: { apiKey: string; apiSecret: string },
  ) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      this.loggerService.log(`${url} started for ${parentId}`);

      const res = await firstValueFrom(
        this.httpService.post(
          `${this.endpoint}/videos/image2video`,
          {
            callback_url: this.callbackUrl,
            duration: 5,
            image: `${this.ingredientsEndpoint}/images/${parentId}`,
            model: options?.model || this.model,
            prompt,
          },
          { headers: this.getHeadersWithOverride(credentialsOverride) },
        ),
      );

      if (res.status !== 200) {
        throw new Error('KlingAI API returned non-200 status');
      }

      return res.data.request_id;
    } catch (error: unknown) {
      const axiosError = error as {
        response?: { status?: number; data?: unknown; statusText?: string };
      };
      if (
        axiosError?.response?.status === 401 ||
        axiosError?.response?.status === 403
      ) {
        this.loggerService.error(`${url} unauthorized`, {
          data: axiosError?.response?.data,
          status: axiosError?.response?.status,
        });
        throw new Error('KlingAI authorization failed');
      }

      this.loggerService.error(`${url} failed`, {
        data: axiosError?.response?.data,
        status: axiosError?.response?.status,
        statusText: axiosError?.response?.statusText,
      });
    }
  }

  public async generateTextToVideo(
    prompt: string,
    options?: { model: string; width: number; height: number },
    credentialsOverride?: { apiKey: string; apiSecret: string },
  ) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      this.loggerService.log(`${url} started`);

      const res = await firstValueFrom(
        this.httpService.post(
          `${this.endpoint}/videos/text2video`,
          {
            aspect_ratio: this.getAspectRatio(options?.width, options?.height),
            callback_url: this.callbackUrl,
            duration: 5,
            model: options?.model || this.model,
            prompt,
          },
          { headers: this.getHeadersWithOverride(credentialsOverride) },
        ),
      );

      if (res.status !== 200) {
        throw new Error('KlingAI API returned non-200 status');
      }

      return res.data.request_id;
    } catch (error: unknown) {
      const axiosError = error as {
        response?: { status?: number; data?: unknown; statusText?: string };
      };
      if (
        axiosError?.response?.status === 401 ||
        axiosError?.response?.status === 403
      ) {
        this.loggerService.error(`${url} unauthorized`, {
          data: axiosError?.response?.data,
          status: axiosError?.response?.status,
        });
        throw new Error('KlingAI authorization failed');
      }

      this.loggerService.error(`${url} failed`, {
        data: axiosError?.response?.data,
        status: axiosError?.response?.status,
        statusText: axiosError?.response?.statusText,
      });
    }
  }

  private getAspectRatio(width?: number, height?: number): string {
    if (!width || !height) {
      return '9:16';
    }

    const key = `${width}:${height}`;
    return this.ratios[key] || '9:16';
  }
}
