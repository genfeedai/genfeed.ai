import {
  SERVER_TOKENS,
  type ServerByokResolver,
} from '@api/server.dependencies';
import {
  HiggsFieldProviderError,
  readHttpStatusCode,
  toHiggsFieldProviderError,
} from '@api/services/integrations/higgsfield/errors/higgsfield-provider.error';
import {
  HIGGSFIELD_DEFAULT_BASE_URL,
  HIGGSFIELD_ENDPOINTS,
  type HiggsFieldEndpoint,
  type HiggsFieldSoulQuality,
  resolveDopVariant,
  toSoulBatchSize,
  toSoulSize,
} from '@api/services/integrations/higgsfield/helpers/higgsfield.catalog';
import {
  type HiggsFieldCredentials,
  type HiggsFieldDopInput,
  type HiggsFieldResponse,
  type HiggsFieldSoulInput,
  type HiggsFieldWebhook,
  isTerminalStatus,
} from '@api/services/integrations/higgsfield/helpers/higgsfield.interface';
import { PollTimeoutException } from '@api/shared/services/poll-until/poll-until.exception';
import { PollUntilService } from '@api/shared/services/poll-until/poll-until.service';
import { createConcurrencyLimit } from '@api/shared/utils/create-concurrency-limit.util';
import { AgentFailureReason, ByokProvider } from '@genfeedai/contracts';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { HttpService } from '@nestjs/axios';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

interface HiggsFieldRequestOptions {
  organizationId?: string;
  webhook?: HiggsFieldWebhook;
}

interface HiggsFieldPollOptions {
  organizationId?: string;
  pollIntervalMs?: number;
  timeoutMs?: number;
}

/**
 * Client for the Higgsfield platform API (v2).
 *
 * The platform is asynchronous: a submit returns a `request_id` plus a status
 * of `queued`, and the caller either polls `/requests/{id}/status` or receives
 * a webhook. Outputs arrive on the same envelope as `images[]` or `video`.
 *
 * Contract verified against the official SDK (`higgsfield-ai/higgsfield-js`,
 * `src/v2/client.ts`), which is the authoritative source for the base URL,
 * the `Key <id>:<secret>` auth scheme, the status path, and the status values.
 */
@Injectable()
export class HiggsFieldService {
  private readonly constructorName: string = String(this.constructor.name);
  private readonly endpoint: string;
  private readonly apiKey: string;
  private readonly apiSecret: string;
  private readonly limit = createConcurrencyLimit(3);

  /** SDK defaults: 2s between polls, 5 minutes total. */
  private readonly defaultPollIntervalMs = 2_000;
  private readonly defaultTimeoutMs = 300_000;

  constructor(
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
    private readonly httpService: HttpService,
    @Inject(SERVER_TOKENS.byok)
    private readonly byokService: ServerByokResolver,
    private readonly pollUntilService: PollUntilService,
  ) {
    this.endpoint = (
      this.configService.get('HIGGSFIELD_API_BASE_URL') ??
      HIGGSFIELD_DEFAULT_BASE_URL
    ).replace(/\/+$/, '');
    this.apiKey = this.configService.get('HIGGSFIELD_API_KEY') ?? '';
    this.apiSecret = this.configService.get('HIGGSFIELD_API_SECRET') ?? '';
  }

  /**
   * Resolves the organization's own key when BYOK is configured, falling back
   * to the platform-wide credentials.
   */
  private async resolveCredentials(
    organizationId?: string,
  ): Promise<HiggsFieldCredentials> {
    if (organizationId) {
      const byokKey = await this.byokService.resolveApiKey(
        organizationId,
        ByokProvider.HIGGSFIELD,
      );
      if (byokKey?.apiKey) {
        if (!byokKey.apiSecret) {
          throw new HiggsFieldProviderError(
            AgentFailureReason.PROVIDER_CONFIGURATION,
            'The Higgsfield BYOK credential for this organization has no API secret. Higgsfield authenticates with a key id and secret pair.',
            { isRetryable: false },
          );
        }
        return { apiKey: byokKey.apiKey, apiSecret: byokKey.apiSecret };
      }
    }

    if (!this.apiKey || !this.apiSecret) {
      // Sending `Authorization: Key :` earns a 401 that reads like a rejected
      // credential rather than an unconfigured one. Fail closed and say so.
      throw new HiggsFieldProviderError(
        AgentFailureReason.PROVIDER_CONFIGURATION,
        'Higgsfield credentials are not configured: set HIGGSFIELD_API_KEY and HIGGSFIELD_API_SECRET, or configure Higgsfield BYOK for this organization.',
        { isRetryable: false },
      );
    }

    return { apiKey: this.apiKey, apiSecret: this.apiSecret };
  }

  /** Higgsfield authenticates with a key id and secret pair on one header. */
  private getHeaders(credentials: HiggsFieldCredentials): {
    Authorization: string;
    'Content-Type': string;
  } {
    return {
      Authorization: `Key ${credentials.apiKey}:${credentials.apiSecret}`,
      'Content-Type': 'application/json',
    };
  }

  /** Caps in-flight submissions so a batch cannot exhaust the rate limit. */
  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    return this.limit(fn);
  }

  /**
   * Submits a job to any platform endpoint. Input is posted verbatim — the
   * platform takes the parameters at the top level, not wrapped in `input`.
   */
  async submit<TInput extends object>(
    endpoint: HiggsFieldEndpoint,
    input: TInput,
    options: HiggsFieldRequestOptions = {},
  ): Promise<HiggsFieldResponse> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const credentials = await this.resolveCredentials(options.organizationId);

    // The platform reads the callback off a query param, not the body.
    const path = options.webhook
      ? `${endpoint}?hf_webhook=${encodeURIComponent(options.webhook.url)}`
      : endpoint;

    try {
      const response = await firstValueFrom(
        this.httpService.post<HiggsFieldResponse>(
          `${this.endpoint}${path}`,
          input,
          { headers: this.getHeaders(credentials) },
        ),
      );

      const submitted = response.data;
      this.loggerService.log(
        `${caller} submitted ${endpoint} as ${submitted.request_id}`,
      );
      return submitted;
    } catch (error: unknown) {
      const mapped = toHiggsFieldProviderError(error);
      this.loggerService.error(`${caller} failed to submit ${endpoint}`, {
        message: mapped.message,
      });
      throw mapped;
    }
  }

  /**
   * Reads a job's current state. Server-side errors are surfaced as a
   * `queued` envelope so a transient 5xx keeps the poll alive rather than
   * failing the generation, matching the SDK's polling behaviour.
   */
  async getRequestStatus(
    requestId: string,
    credentials: HiggsFieldCredentials,
  ): Promise<HiggsFieldResponse> {
    try {
      const response = await firstValueFrom(
        this.httpService.get<HiggsFieldResponse>(
          `${this.endpoint}/requests/${requestId}/status`,
          { headers: this.getHeaders(credentials) },
        ),
      );
      return response.data;
    } catch (error: unknown) {
      // Only a server-side fault is worth another attempt: a 4xx (bad
      // credentials, unknown request id) will read the same way forever.
      const statusCode = readHttpStatusCode(error);
      if (statusCode !== undefined && statusCode < 500) {
        throw toHiggsFieldProviderError(error);
      }

      const mapped = toHiggsFieldProviderError(error);
      this.loggerService.warn(
        `${this.constructorName} status poll for ${requestId} retried`,
        { message: mapped.message },
      );
      return { request_id: requestId, status: 'queued' };
    }
  }

  /**
   * Polls a job until it reaches a terminal status, then asserts it succeeded.
   * `nsfw` is a terminal rejection, not a failure to retry.
   */
  async waitForCompletion(
    requestId: string,
    options: HiggsFieldPollOptions = {},
  ): Promise<HiggsFieldResponse> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const credentials = await this.resolveCredentials(options.organizationId);

    try {
      const { value } = await this.pollUntilService.poll(
        () => this.getRequestStatus(requestId, credentials),
        (response) => isTerminalStatus(response.status),
        {
          intervalMs: options.pollIntervalMs ?? this.defaultPollIntervalMs,
          timeoutMs: options.timeoutMs ?? this.defaultTimeoutMs,
        },
      );

      if (value.status === 'nsfw') {
        throw new HiggsFieldProviderError(
          AgentFailureReason.ACTION_NOT_ALLOWED,
          `Higgsfield job ${requestId} was rejected by the safety filter.`,
          { isRetryable: false },
        );
      }

      if (value.status === 'canceled') {
        throw new HiggsFieldProviderError(
          AgentFailureReason.CANCELLED,
          `Higgsfield job ${requestId} was cancelled.`,
          { isRetryable: false },
        );
      }

      if (value.status === 'failed') {
        throw new HiggsFieldProviderError(
          AgentFailureReason.PROVIDER_UNAVAILABLE,
          `Higgsfield job ${requestId} failed.`,
          { isRetryable: true },
        );
      }

      this.loggerService.log(`${caller} job ${requestId} completed`);
      return value;
    } catch (error: unknown) {
      if (error instanceof PollTimeoutException) {
        throw new HiggsFieldProviderError(
          AgentFailureReason.TIMEOUT,
          `Higgsfield job ${requestId} timed out after ${error.timeoutMs}ms.`,
          { isRetryable: true },
        );
      }
      throw error;
    }
  }

  /**
   * Soul text-to-image. Returns every rendered image — Soul renders a batch of
   * 1 or 4, so callers that asked for more than one get the whole set.
   */
  async generateTextToImage(params: {
    prompt: string;
    aspectRatio?: string;
    quality?: HiggsFieldSoulQuality;
    batchSize?: number;
    referenceImageUrl?: string;
    seed?: number;
    organizationId?: string;
    webhook?: HiggsFieldWebhook;
  }): Promise<{ requestId: string; imageUrls: string[] }> {
    const input: HiggsFieldSoulInput = {
      batch_size: toSoulBatchSize(params.batchSize),
      prompt: params.prompt,
      quality: params.quality ?? '1080p',
      width_and_height: toSoulSize(params.aspectRatio),
      ...(params.referenceImageUrl
        ? {
            image_reference: {
              image_url: params.referenceImageUrl,
              type: 'image_url' as const,
            },
          }
        : {}),
      ...(params.seed === undefined ? {} : { seed: params.seed }),
    };

    const submitted = await this.submit(
      HIGGSFIELD_ENDPOINTS.SOUL_TEXT_TO_IMAGE,
      input,
      { organizationId: params.organizationId, webhook: params.webhook },
    );

    return {
      imageUrls: (submitted.images ?? []).map((image) => image.url),
      requestId: submitted.request_id,
    };
  }

  /**
   * Waits for a Soul job and returns its rendered images.
   */
  async waitForImageCompletion(
    requestId: string,
    options: HiggsFieldPollOptions = {},
  ): Promise<{ imageUrls: string[] }> {
    const completed = await this.waitForCompletion(requestId, options);
    const imageUrls = (completed.images ?? []).map((image) => image.url);

    if (imageUrls.length === 0) {
      throw new HiggsFieldProviderError(
        AgentFailureReason.PROVIDER_UNAVAILABLE,
        `Higgsfield job ${requestId} completed without an image.`,
        { isRetryable: true },
      );
    }

    return { imageUrls };
  }

  /**
   * DoP image-to-video. The endpoint takes the quality tier as its `model`
   * field and derives framing and length from the source image, so there is
   * no aspect-ratio or duration input to pass through.
   */
  async generateImageToVideo(params: {
    modelKey: string;
    imageUrl: string;
    prompt: string;
    seed?: number;
    isPromptEnhanced?: boolean;
    organizationId?: string;
    webhook?: HiggsFieldWebhook;
  }): Promise<{ requestId: string; videoUrl?: string }> {
    const variant = resolveDopVariant(params.modelKey);
    if (!variant) {
      throw new BadRequestException(
        `Unknown Higgsfield video model: ${params.modelKey}`,
      );
    }

    const input: HiggsFieldDopInput = {
      input_images: [{ image_url: params.imageUrl, type: 'image_url' }],
      model: variant,
      prompt: params.prompt,
      ...(params.isPromptEnhanced === undefined
        ? {}
        : { enhance_prompt: params.isPromptEnhanced }),
      ...(params.seed === undefined ? {} : { seed: params.seed }),
    };

    const submitted = await this.submit(
      HIGGSFIELD_ENDPOINTS.DOP_IMAGE_TO_VIDEO,
      input,
      { organizationId: params.organizationId, webhook: params.webhook },
    );

    return {
      requestId: submitted.request_id,
      videoUrl: submitted.video?.url,
    };
  }

  /** Concurrency-limited variant of {@link generateImageToVideo}. */
  queueGenerateImageToVideo(
    params: Parameters<HiggsFieldService['generateImageToVideo']>[0],
  ): Promise<{ requestId: string; videoUrl?: string }> {
    return this.enqueue(() => this.generateImageToVideo(params));
  }

  /**
   * Waits for a DoP job and returns its rendered video.
   */
  async waitForVideoCompletion(
    requestId: string,
    options: HiggsFieldPollOptions = {},
  ): Promise<{ videoUrl: string }> {
    const completed = await this.waitForCompletion(requestId, options);
    const videoUrl = completed.video?.url;

    if (!videoUrl) {
      throw new HiggsFieldProviderError(
        AgentFailureReason.PROVIDER_UNAVAILABLE,
        `Higgsfield job ${requestId} completed without a video.`,
        { isRetryable: true },
      );
    }

    return { videoUrl };
  }

  /** Cancels an in-flight job. */
  async cancel(requestId: string, organizationId?: string): Promise<void> {
    const credentials = await this.resolveCredentials(organizationId);

    try {
      await firstValueFrom(
        this.httpService.post(
          `${this.endpoint}/requests/${requestId}/cancel`,
          {},
          { headers: this.getHeaders(credentials) },
        ),
      );
    } catch (error: unknown) {
      throw toHiggsFieldProviderError(error);
    }
  }
}
