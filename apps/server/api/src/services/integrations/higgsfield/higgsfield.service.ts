import { ConfigService } from '@api/config/config.service';
import { ByokService } from '@api/services/byok/byok.service';
import { PollTimeoutException } from '@api/shared/services/poll-until/poll-until.exception';
import { PollUntilService } from '@api/shared/services/poll-until/poll-until.service';
import { ByokProvider } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import pLimit from 'p-limit';
import { firstValueFrom } from 'rxjs';

interface HiggsFieldJobStatus {
  status: 'pending' | 'processing' | 'completed' | 'failed';
  output?: {
    video_url?: string;
  };
  error?: string;
}

@Injectable()
export class HiggsFieldService {
  private readonly constructorName: string = String(this.constructor.name);
  private readonly endpoint = 'https://platform.higgsfield.ai';
  private readonly apiKey: string;
  private readonly apiSecret: string;
  private readonly limit = pLimit(3);

  private readonly defaultModelId = 'kling-video/v3/pro/image-to-video';

  constructor(
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
    private readonly httpService: HttpService,
    private readonly byokService: ByokService,
    private readonly pollUntilService: PollUntilService,
  ) {
    this.apiKey = this.configService.get('HIGGSFIELD_API_KEY') ?? '';
    this.apiSecret = this.configService.get('HIGGSFIELD_API_SECRET') ?? '';
  }

  private getHeaders(credentialsOverride?: {
    apiKey: string;
    apiSecret?: string;
  }): { Authorization: string; 'Content-Type': string } {
    const key = credentialsOverride?.apiKey || this.apiKey;
    const secret = credentialsOverride?.apiSecret || this.apiSecret;
    return {
      Authorization: `Key ${key}:${secret}`,
      'Content-Type': 'application/json',
    };
  }

  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    return this.limit(fn);
  }

  /**
   * Generate image-to-video using Higgsfield platform.
   * Configurable model via modelId param.
   */
  async generateImageToVideo(params: {
    modelId?: string;
    imageUrl: string;
    prompt: string;
    duration?: number;
    aspectRatio?: string;
    organizationId?: string;
  }): Promise<{ requestId: string; videoUrl?: string }> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const modelId = params.modelId || this.defaultModelId;

    let credentialsOverride: { apiKey: string; apiSecret?: string } | undefined;
    if (params.organizationId) {
      const byokKey = await this.byokService.resolveApiKey(
        params.organizationId,
        ByokProvider.HIGGSFIELD,
      );
      if (byokKey) {
        credentialsOverride = byokKey;
      }
    }

    try {
      this.loggerService.log(`${caller} started with model: ${modelId}`);

      const response = await firstValueFrom(
        this.httpService.post(
          `${this.endpoint}/${modelId}`,
          {
            aspect_ratio: params.aspectRatio ?? '9:16',
            duration: params.duration ?? 5,
            image_url: params.imageUrl,
            prompt: params.prompt,
          },
          { headers: this.getHeaders(credentialsOverride) },
        ),
      );

      if (response.status !== 200 && response.status !== 201) {
        throw new Error(`Higgsfield API returned status ${response.status}`);
      }

      const requestId = response.data.request_id ?? response.data.id;

      this.loggerService.log(`${caller} job submitted: ${requestId}`);

      return {
        requestId,
        videoUrl: response.data.output?.video_url,
      };
    } catch (error: unknown) {
      const axiosError = error as {
        response?: { status?: number; data?: unknown; statusText?: string };
      };

      if (
        axiosError?.response?.status === 401 ||
        axiosError?.response?.status === 403
      ) {
        this.loggerService.error(`${caller} unauthorized`, {
          data: axiosError?.response?.data,
          status: axiosError?.response?.status,
        });
        throw new Error('Higgsfield authorization failed');
      }

      this.loggerService.error(`${caller} failed`, {
        data: axiosError?.response?.data,
        status: axiosError?.response?.status,
        statusText: axiosError?.response?.statusText,
      });
      throw error;
    }
  }

  /**
   * Queue-limited version of generateImageToVideo.
   */
  queueGenerateImageToVideo(params: {
    modelId?: string;
    imageUrl: string;
    prompt: string;
    duration?: number;
    aspectRatio?: string;
    organizationId?: string;
  }): Promise<{ requestId: string; videoUrl?: string }> {
    return this.enqueue(() => this.generateImageToVideo(params));
  }

  /**
   * Generate text-to-image using Higgsfield Soul model.
   */
  async generateTextToImage(params: {
    prompt: string;
    aspectRatio?: string;
    organizationId?: string;
  }): Promise<{ requestId: string; imageUrl?: string }> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const modelId = 'higgsfield-ai/soul/standard';

    let credentialsOverride: { apiKey: string; apiSecret?: string } | undefined;
    if (params.organizationId) {
      const byokKey = await this.byokService.resolveApiKey(
        params.organizationId,
        ByokProvider.HIGGSFIELD,
      );
      if (byokKey) {
        credentialsOverride = byokKey;
      }
    }

    try {
      this.loggerService.log(`${caller} started`);

      const response = await firstValueFrom(
        this.httpService.post(
          `${this.endpoint}/${modelId}`,
          {
            aspect_ratio: params.aspectRatio ?? '9:16',
            prompt: params.prompt,
          },
          { headers: this.getHeaders(credentialsOverride) },
        ),
      );

      if (response.status !== 200 && response.status !== 201) {
        throw new Error(`Higgsfield API returned status ${response.status}`);
      }

      const requestId = response.data.request_id ?? response.data.id;

      return {
        imageUrl: response.data.output?.image_url,
        requestId,
      };
    } catch (error: unknown) {
      const axiosError = error as {
        response?: { status?: number; data?: unknown; statusText?: string };
      };

      this.loggerService.error(`${caller} failed`, {
        data: axiosError?.response?.data,
        status: axiosError?.response?.status,
        statusText: axiosError?.response?.statusText,
      });
      throw error;
    }
  }

  /**
   * Poll a Higgsfield job for completion.
   */
  async pollJob(
    requestId: string,
    credentialsOverride?: { apiKey: string; apiSecret?: string },
  ): Promise<HiggsFieldJobStatus> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.endpoint}/requests/${requestId}`, {
          headers: this.getHeaders(credentialsOverride),
        }),
      );

      return response.data;
    } catch (error: unknown) {
      this.loggerService.error(`${caller} poll failed for ${requestId}`, {
        error,
      });
      return { error: 'Poll request failed', status: 'failed' };
    }
  }

  /**
   * Poll job until completed or failed, with timeout.
   * Delegates to PollUntilService to avoid duplicated while-loop logic.
   */
  async waitForCompletion(
    requestId: string,
    options?: {
      pollIntervalMs?: number;
      timeoutMs?: number;
      organizationId?: string;
    },
  ): Promise<{ videoUrl: string }> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    let credentialsOverride: { apiKey: string; apiSecret?: string } | undefined;
    if (options?.organizationId) {
      const byokKey = await this.byokService.resolveApiKey(
        options.organizationId,
        ByokProvider.HIGGSFIELD,
      );
      if (byokKey) {
        credentialsOverride = byokKey;
      }
    }

    try {
      const { value: status } = await this.pollUntilService.poll(
        () => this.pollJob(requestId, credentialsOverride),
        (s) => {
          if (s.status === 'failed') {
            throw new Error(
              `Higgsfield job ${requestId} failed: ${s.error ?? 'unknown error'}`,
            );
          }
          return s.status === 'completed' && Boolean(s.output?.video_url);
        },
        {
          intervalMs: options?.pollIntervalMs ?? 10_000,
          timeoutMs: options?.timeoutMs ?? 600_000,
        },
      );

      this.loggerService.log(`${caller} job ${requestId} completed`);
      return { videoUrl: status.output!.video_url! };
    } catch (err: unknown) {
      if (err instanceof PollTimeoutException) {
        throw new Error(
          `Higgsfield job ${requestId} timed out after ${err.timeoutMs}ms`,
        );
      }
      throw err;
    }
  }
}
