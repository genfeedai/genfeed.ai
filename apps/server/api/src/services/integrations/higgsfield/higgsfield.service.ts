import { createHash, randomUUID } from 'node:crypto';
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
  HIGGSFIELD_ADS_STUDIO_DEFAULT_ASPECT_RATIO,
  HIGGSFIELD_ADS_STUDIO_MAX_BATCH_SIZE,
  HIGGSFIELD_ADS_STUDIO_MAX_IMAGE_URLS,
  HIGGSFIELD_ADS_STUDIO_MAX_PROMPT_LENGTH,
  HIGGSFIELD_API_BASE,
  HIGGSFIELD_CINEMA_STUDIO_DEFAULT_DURATION_SECONDS,
  HIGGSFIELD_CINEMA_STUDIO_DEFAULT_RESOLUTION,
  HIGGSFIELD_CINEMA_STUDIO_MAX_AUDIO_URLS,
  HIGGSFIELD_CINEMA_STUDIO_MAX_DURATION_SECONDS,
  HIGGSFIELD_CINEMA_STUDIO_MAX_IMAGE_URLS,
  HIGGSFIELD_CINEMA_STUDIO_MAX_VIDEO_URLS,
  HIGGSFIELD_CINEMA_STUDIO_MIN_DURATION_SECONDS,
  HIGGSFIELD_CINEMA_STUDIO_RESOLUTIONS,
  HIGGSFIELD_GENJUTSU_DEFAULT_RESOLUTION,
  HIGGSFIELD_GENJUTSU_RESOLUTIONS,
  HIGGSFIELD_GENJUTSU_RESTYLE_MAX_IMAGE_URLS,
  HIGGSFIELD_GENJUTSU_RESTYLE_PRESETS_PATH,
  HIGGSFIELD_SOUL_ENDPOINT,
  type HiggsFieldSoulQuality,
  resolveDopEndpoint,
  resolveSoulEndpoint,
  toSoulAspectRatio,
  toSoulBatchSize,
} from '@api/services/integrations/higgsfield/helpers/higgsfield.catalog';
import {
  type HiggsFieldAdsStudioInput,
  type HiggsFieldCinemaStudioInput,
  type HiggsFieldCredentials,
  type HiggsFieldDopInput,
  type HiggsFieldGenjutsuInput,
  type HiggsFieldGenjutsuRestyleInput,
  type HiggsFieldResponse,
  type HiggsFieldRestylePreset,
  type HiggsFieldSoulInput,
  type HiggsFieldVideoRequestState,
  type HiggsFieldWebhook,
  isTerminalStatus,
} from '@api/services/integrations/higgsfield/helpers/higgsfield.interface';
import { PollTimeoutException } from '@api/shared/services/poll-until/poll-until.exception';
import { PollUntilService } from '@api/shared/services/poll-until/poll-until.service';
import { createConcurrencyLimit } from '@api/shared/utils/create-concurrency-limit.util';
import { AgentFailureReason, ByokProvider } from '@genfeedai/contracts';
import { ASPECT_RATIOS, MODEL_KEYS } from '@genfeedai/contracts/constants';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Traced } from '@libs/tracing/traced';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { HttpService } from '@nestjs/axios';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

const TRAILING_SLASHES_PATTERN = /\/+$/;
const HTTP_URL_PATTERN = /^https?:\/\//;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface HiggsFieldGenjutsuEditParams {
  expectedCredentialFingerprint?: string;
  idempotencyKey?: string;
  imageUrls: readonly string[];
  onProviderSubmissionStarted?: () => void;
  organizationId?: string;
  prompt?: string;
  resolution?: string;
  videoUrl: string;
}

interface HiggsFieldVideoSubmission {
  requestId: string;
  status: HiggsFieldResponse['status'];
  videoUrl?: string;
}

interface HiggsFieldRequestOptions {
  expectedCredentialFingerprint?: string;
  idempotencyKey?: string;
  onProviderSubmissionStarted?: () => void;
  organizationId?: string;
  webhook?: HiggsFieldWebhook;
}

interface HiggsFieldPollOptions {
  organizationId?: string;
  pollIntervalMs?: number;
  timeoutMs?: number;
}

/**
 * Client for the documented Higgsfield REST catalog.
 *
 * Submit posts to `https://api.higgsfield.ai/<endpoint-id>` (Soul 2, DoP,
 * Genjutsu), then polls `GET /requests/{id}/status`. Auth is `Key <id>:<secret>`.
 *
 * @see https://docs.higgsfield.ai/docs
 */
@Traced()
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
      this.configService.get('HIGGSFIELD_API_BASE_URL') ?? HIGGSFIELD_API_BASE
    ).replace(TRAILING_SLASHES_PATTERN, '');
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

  private credentialFingerprint(credentials: HiggsFieldCredentials): string {
    return createHash('sha256')
      .update(
        JSON.stringify({ endpoint: this.endpoint, apiKey: credentials.apiKey }),
      )
      .digest('hex');
  }
  async getCredentialFingerprint(organizationId: string): Promise<string> {
    return this.credentialFingerprint(
      await this.resolveCredentials(organizationId),
    );
  }
  private assertCredentialBinding(
    credentials: HiggsFieldCredentials,
    expected?: string,
  ): void {
    if (expected && expected !== this.credentialFingerprint(credentials))
      throw new BadRequestException(
        'CHARACTER_REPLACEMENT_CREDENTIALS_CHANGED',
      );
  }
  /**
   * One status read of an accepted video request, classified for a durable
   * poller that reschedules itself instead of waiting. A failed read of a
   * running job is `pending`, as in {@link getRequestStatus}.
   */
  async readVideoRequest(
    requestId: string,
    organizationId: string,
  ): Promise<HiggsFieldVideoRequestState> {
    const credentials = await this.resolveCredentials(organizationId);
    const response = await this.getRequestStatus(requestId, credentials, true);
    if (!isTerminalStatus(response.status)) {
      return { state: 'pending' };
    }
    if (response.status === 'completed') {
      return response.video?.url
        ? { state: 'completed', videoUrl: response.video.url }
        : {
            reason: `Higgsfield job ${requestId} completed without a video.`,
            state: 'failed',
          };
    }
    const reasons: Record<string, string> = {
      canceled: `Higgsfield job ${requestId} was canceled.`,
      failed: `Higgsfield job ${requestId} failed.`,
      nsfw: `Higgsfield job ${requestId} was rejected by the safety filter.`,
    };
    return {
      reason: reasons[response.status] ?? `Higgsfield job ${requestId} ended.`,
      state: 'failed',
    };
  }

  async getBoundRequestStatus(
    requestId: string,
    organizationId: string,
    expected: string,
  ): Promise<HiggsFieldResponse> {
    const credentials = await this.resolveCredentials(organizationId);
    this.assertCredentialBinding(credentials, expected);
    return this.getRequestStatus(requestId, credentials, true);
  }

  /** Higgsfield authenticates with a key id and secret pair on one header. */
  private getHeaders(
    credentials: HiggsFieldCredentials,
    idempotencyKey?: string,
  ): {
    Authorization: string;
    'Content-Type': string;
    'Idempotency-Key'?: string;
  } {
    return {
      Authorization: `Key ${credentials.apiKey}:${credentials.apiSecret}`,
      'Content-Type': 'application/json',
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    };
  }

  private buildSubmitUrl(
    endpointId: string,
    webhook?: HiggsFieldWebhook,
  ): string {
    const path = endpointId.startsWith('/') ? endpointId : `/${endpointId}`;
    const url = `${this.endpoint}${path}`;
    if (!webhook) {
      return url;
    }
    return `${url}?hf_webhook=${encodeURIComponent(webhook.url)}`;
  }

  /** Caps in-flight submissions so a batch cannot exhaust the rate limit. */
  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    return this.limit(fn);
  }

  /**
   * Submits a job to a catalog endpoint id (`higgsfield-ai/soul/v2/standard`).
   * Input is posted at the top level, not wrapped in `input`.
   */
  async submit<TInput extends object>(
    endpointId: string,
    input: TInput,
    options: HiggsFieldRequestOptions = {},
  ): Promise<HiggsFieldResponse> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const credentials = await this.resolveCredentials(options.organizationId);
    this.assertCredentialBinding(
      credentials,
      options.expectedCredentialFingerprint,
    );

    try {
      const submitUrl = this.buildSubmitUrl(endpointId, options.webhook);
      const headers = this.getHeaders(credentials, options.idempotencyKey);
      options.onProviderSubmissionStarted?.();
      const response = await firstValueFrom(
        this.httpService.post<HiggsFieldResponse>(submitUrl, input, {
          headers,
        }),
      );

      const submitted = response.data;
      this.loggerService.log(
        `${caller} submitted ${endpointId} as ${submitted.request_id}`,
      );
      return submitted;
    } catch (error: unknown) {
      const mapped = toHiggsFieldProviderError(error);
      this.loggerService.error(`${caller} failed to submit ${endpointId}`, {
        ...(options.expectedCredentialFingerprint
          ? { statusCode: readHttpStatusCode(error) }
          : { message: mapped.message }),
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
    safeErrorLogging = false,
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
      const mapped = toHiggsFieldProviderError(error);
      if (mapped instanceof HiggsFieldProviderError && !mapped.isRetryable) {
        throw mapped;
      }
      const statusCode = readHttpStatusCode(error);
      this.loggerService.warn(
        `${this.constructorName} status poll for ${requestId} retried`,
        safeErrorLogging ? { statusCode } : { message: mapped.message },
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
          `Higgsfield job ${requestId} was canceled.`,
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
   * Soul text-to-image on Soul 2 (default), Soul Standard or Soul Cinema.
   * Returns every rendered image — Soul renders a batch of 1 or 4, so callers
   * that asked for more than one get the whole set.
   */
  async generateTextToImage(params: {
    modelKey?: string;
    prompt: string;
    onProviderSubmissionStarted?: () => void;
    aspectRatio?: string;
    quality?: HiggsFieldSoulQuality;
    batchSize?: number;
    seed?: number;
    organizationId?: string;
    webhook?: HiggsFieldWebhook;
  }): Promise<{ requestId: string; imageUrls: string[] }> {
    const endpointId = resolveSoulEndpoint(params.modelKey);
    const input: HiggsFieldSoulInput = {
      aspect_ratio: toSoulAspectRatio(params.aspectRatio),
      batch_size: toSoulBatchSize(params.batchSize),
      prompt: params.prompt,
      // Soul 2 has always dispatched at 1080p; the other two follow the
      // documented 720p default so an unpriced tier is never reached by default.
      resolution:
        params.quality ??
        (endpointId === HIGGSFIELD_SOUL_ENDPOINT ? '1080p' : '720p'),
      ...(params.seed === undefined ? {} : { seed: params.seed }),
    };

    const submitted = await this.submit(endpointId, input, {
      organizationId: params.organizationId,
      onProviderSubmissionStarted: params.onProviderSubmissionStarted,
      webhook: params.webhook,
    });

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
   * DoP image-to-video. Framing and length come from the source image; the
   * documented body is `{ prompt, image_url }` on the model endpoint id.
   */
  async generateImageToVideo(params: {
    onProviderSubmissionStarted?: () => void;
    modelKey: string;
    imageUrl: string;
    prompt: string;
    organizationId?: string;
    webhook?: HiggsFieldWebhook;
  }): Promise<{ requestId: string; videoUrl?: string }> {
    const endpointId = resolveDopEndpoint(params.modelKey);
    if (!endpointId) {
      throw new BadRequestException(
        `Unknown Higgsfield video model: ${params.modelKey}`,
      );
    }

    const input: HiggsFieldDopInput = {
      image_url: params.imageUrl,
      prompt: params.prompt,
    };

    const submitted = await this.submit(endpointId, input, {
      onProviderSubmissionStarted: params.onProviderSubmissionStarted,
      organizationId: params.organizationId,
      webhook: params.webhook,
    });

    return {
      requestId: submitted.request_id,
      videoUrl: submitted.video?.url,
    };
  }

  /**
   * Genjutsu motion transfer. The source clip is at least 4s and trimmed at
   * 30s by Higgsfield. One to eight character stills ride `image_urls`.
   */
  generateMotionTransfer(
    params: HiggsFieldGenjutsuEditParams,
  ): Promise<HiggsFieldVideoSubmission> {
    return this.submitGenjutsuEdit(MODEL_KEYS.HIGGSFIELD_GENJUTSU, params);
  }

  /**
   * Genjutsu object swap. Same request shape as motion transfer: the source
   * clip (4s minimum, 30s kept) and one to eight reference stills.
   */
  generateObjectSwap(
    params: HiggsFieldGenjutsuEditParams,
  ): Promise<HiggsFieldVideoSubmission> {
    return this.submitGenjutsuEdit(
      MODEL_KEYS.HIGGSFIELD_GENJUTSU_OBJECT_SWAP,
      params,
    );
  }

  private async submitGenjutsuEdit(
    endpointId: string,
    params: HiggsFieldGenjutsuEditParams,
  ): Promise<HiggsFieldVideoSubmission> {
    const videoUrl = this.readSourceVideoUrl(params);
    const imageUrls = this.readGenjutsuImageUrls(params, 1, 8);

    const input: HiggsFieldGenjutsuInput = {
      image_urls: imageUrls,
      prompt: params.prompt?.trim() ?? '',
      resolution: this.toGenjutsuResolution(params.resolution),
      video_url: videoUrl,
    };

    const submitted = await this.submit(endpointId, input, {
      idempotencyKey: params.idempotencyKey ?? randomUUID(),
      expectedCredentialFingerprint: params.expectedCredentialFingerprint,
      onProviderSubmissionStarted: params.onProviderSubmissionStarted,
      organizationId: params.organizationId,
    });

    return {
      status: submitted.status,
      requestId: submitted.request_id,
      videoUrl: submitted.video?.url,
    };
  }

  private readSourceVideoUrl(params: HiggsFieldGenjutsuEditParams): string {
    const videoUrl = params.idempotencyKey
      ? params.videoUrl
      : params.videoUrl.trim();
    if (!videoUrl.startsWith('https://')) {
      throw new BadRequestException(
        'Higgsfield Genjutsu requires an https source video URL.',
      );
    }
    return videoUrl;
  }

  /**
   * With a caller-supplied idempotency key the payload must stay identical to
   * the first attempt, so URLs are checked but not trimmed or deduplicated.
   */
  private readGenjutsuImageUrls(
    params: Pick<HiggsFieldGenjutsuEditParams, 'idempotencyKey' | 'imageUrls'>,
    min: number,
    max: number,
  ): string[] {
    const imageUrls = params.idempotencyKey
      ? [...params.imageUrls]
      : [
          ...new Set(
            params.imageUrls
              .map((url) => url.trim())
              .filter((url) => url.startsWith('https://')),
          ),
        ];
    if (
      imageUrls.length < min ||
      imageUrls.length > max ||
      imageUrls.some((url) => !url.startsWith('https://'))
    ) {
      throw new BadRequestException(
        min === 0
          ? `Higgsfield Genjutsu accepts at most ${max} https character image URLs.`
          : `Higgsfield Genjutsu requires ${min} to ${max} https character image URLs.`,
      );
    }
    return imageUrls;
  }

  private toGenjutsuResolution(
    resolution: string | undefined,
  ): (typeof HIGGSFIELD_GENJUTSU_RESOLUTIONS)[number] {
    return (
      HIGGSFIELD_GENJUTSU_RESOLUTIONS.find((value) => value === resolution) ??
      HIGGSFIELD_GENJUTSU_DEFAULT_RESOLUTION
    );
  }

  /**
   * Genjutsu restyle: re-renders the source clip in one catalog style preset.
   * The preset id must come from {@link listRestylePresets}; Higgsfield fails
   * an unknown or hidden preset and never substitutes another style.
   */
  async generateRestyle(
    params: Omit<HiggsFieldGenjutsuEditParams, 'imageUrls'> & {
      imageUrls?: readonly string[];
      presetId: string;
    },
  ): Promise<HiggsFieldVideoSubmission> {
    if (!UUID_PATTERN.test(params.presetId)) {
      throw new BadRequestException(
        'Higgsfield Genjutsu restyle requires a style preset id (a UUID from the preset catalog).',
      );
    }
    const videoUrl = this.readSourceVideoUrl({
      ...params,
      imageUrls: params.imageUrls ?? [],
    });
    const imageUrls = this.readGenjutsuImageUrls(
      {
        idempotencyKey: params.idempotencyKey,
        imageUrls: params.imageUrls ?? [],
      },
      0,
      HIGGSFIELD_GENJUTSU_RESTYLE_MAX_IMAGE_URLS,
    );

    const input: HiggsFieldGenjutsuRestyleInput = {
      image_urls: imageUrls,
      preset_id: params.presetId,
      prompt: params.prompt?.trim() ?? '',
      resolution: this.toGenjutsuResolution(params.resolution),
      video_url: videoUrl,
    };

    const submitted = await this.submit(
      MODEL_KEYS.HIGGSFIELD_GENJUTSU_RESTYLE,
      input,
      {
        idempotencyKey: params.idempotencyKey ?? randomUUID(),
        expectedCredentialFingerprint: params.expectedCredentialFingerprint,
        onProviderSubmissionStarted: params.onProviderSubmissionStarted,
        organizationId: params.organizationId,
      },
    );

    return {
      status: submitted.status,
      requestId: submitted.request_id,
      videoUrl: submitted.video?.url,
    };
  }

  /** Selectable system styles for {@link generateRestyle}, ordered by name. */
  async listRestylePresets(
    organizationId?: string,
  ): Promise<HiggsFieldRestylePreset[]> {
    const credentials = await this.resolveCredentials(organizationId);

    try {
      const response = await firstValueFrom(
        this.httpService.get<{ items?: HiggsFieldRestylePreset[] }>(
          `${this.endpoint}${HIGGSFIELD_GENJUTSU_RESTYLE_PRESETS_PATH}`,
          { headers: this.getHeaders(credentials) },
        ),
      );
      return response.data.items ?? [];
    } catch (error: unknown) {
      throw toHiggsFieldProviderError(error);
    }
  }

  /**
   * Ads Studio: one brief becomes `batchSize` ad concepts rendered as images.
   * Billing is per rendered image and token-metered, so every value is
   * validated rather than coerced; the caller picks a supported ratio.
   */
  async generateAdsStudioImages(params: {
    aspectRatio?: string;
    batchSize?: number;
    expectedCredentialFingerprint?: string;
    idempotencyKey?: string;
    imageUrls?: readonly string[];
    language?: string;
    niche?: string;
    onProviderSubmissionStarted?: () => void;
    organizationId?: string;
    prompt: string;
    targetAudience?: string;
  }): Promise<{ requestId: string; imageUrls: string[] }> {
    const prompt = params.prompt.trim();
    if (!prompt || prompt.length > HIGGSFIELD_ADS_STUDIO_MAX_PROMPT_LENGTH) {
      throw new BadRequestException(
        `Higgsfield Ads Studio requires a brief of 1 to ${HIGGSFIELD_ADS_STUDIO_MAX_PROMPT_LENGTH} characters.`,
      );
    }

    const batchSize = params.batchSize ?? 1;
    if (
      !Number.isInteger(batchSize) ||
      batchSize < 1 ||
      batchSize > HIGGSFIELD_ADS_STUDIO_MAX_BATCH_SIZE
    ) {
      throw new BadRequestException(
        `Higgsfield Ads Studio batch size must be a whole number from 1 to ${HIGGSFIELD_ADS_STUDIO_MAX_BATCH_SIZE}.`,
      );
    }

    const aspectRatio =
      params.aspectRatio ?? HIGGSFIELD_ADS_STUDIO_DEFAULT_ASPECT_RATIO;
    const supportedAspectRatios: readonly string[] =
      ASPECT_RATIOS.HIGGSFIELD_ADS_STUDIO;
    if (!supportedAspectRatios.includes(aspectRatio)) {
      throw new BadRequestException(
        `Higgsfield Ads Studio aspect ratio must be one of ${supportedAspectRatios.join(', ')}.`,
      );
    }

    const imageUrls = params.imageUrls ? [...params.imageUrls] : [];
    if (
      imageUrls.length > HIGGSFIELD_ADS_STUDIO_MAX_IMAGE_URLS ||
      imageUrls.some((url) => !HTTP_URL_PATTERN.test(url))
    ) {
      throw new BadRequestException(
        `Higgsfield Ads Studio accepts at most ${HIGGSFIELD_ADS_STUDIO_MAX_IMAGE_URLS} http(s) reference image URLs.`,
      );
    }

    const input: HiggsFieldAdsStudioInput = {
      aspect_ratio: aspectRatio,
      batch_size: batchSize,
      prompt,
      ...(imageUrls.length > 0 ? { image_urls: imageUrls } : {}),
      ...(params.language ? { language: params.language } : {}),
      ...(params.niche ? { niche: params.niche } : {}),
      ...(params.targetAudience
        ? { target_audience: params.targetAudience }
        : {}),
    };

    const submitted = await this.submit(
      MODEL_KEYS.HIGGSFIELD_ADS_STUDIO,
      input,
      {
        expectedCredentialFingerprint: params.expectedCredentialFingerprint,
        idempotencyKey: params.idempotencyKey ?? randomUUID(),
        onProviderSubmissionStarted: params.onProviderSubmissionStarted,
        organizationId: params.organizationId,
      },
    );

    return {
      imageUrls: (submitted.images ?? []).map((image) => image.url),
      requestId: submitted.request_id,
    };
  }

  /**
   * Cinema Studio 4.0. Text-to-video with no media, reference-to-video with
   * any. Every value is validated, never coerced: the request is metered in
   * provider tokens from these parameters, so a silently adjusted duration or
   * resolution would bill something other than what was quoted. The
   * idempotency key is fixed before the first attempt so an ambiguous
   * submission is never blindly resubmitted as a second paid generation.
   */
  async generateCinemaStudioVideo(params: {
    aspectRatio?: string;
    audioUrls?: readonly string[];
    duration?: number;
    expectedCredentialFingerprint?: string;
    generateAudio?: boolean;
    idempotencyKey?: string;
    imageUrls?: readonly string[];
    onProviderSubmissionStarted?: () => void;
    organizationId?: string;
    prompt: string;
    resolution?: string;
    videoUrls?: readonly string[];
  }): Promise<{
    requestId: string;
    videoUrl?: string;
    status: HiggsFieldResponse['status'];
  }> {
    const prompt = params.prompt.trim();
    if (!prompt) {
      throw new BadRequestException(
        'Higgsfield Cinema Studio requires a non-empty prompt.',
      );
    }

    const duration =
      params.duration ?? HIGGSFIELD_CINEMA_STUDIO_DEFAULT_DURATION_SECONDS;
    if (
      !Number.isInteger(duration) ||
      duration < HIGGSFIELD_CINEMA_STUDIO_MIN_DURATION_SECONDS ||
      duration > HIGGSFIELD_CINEMA_STUDIO_MAX_DURATION_SECONDS
    ) {
      throw new BadRequestException(
        `Higgsfield Cinema Studio duration must be a whole number of seconds from ${HIGGSFIELD_CINEMA_STUDIO_MIN_DURATION_SECONDS} to ${HIGGSFIELD_CINEMA_STUDIO_MAX_DURATION_SECONDS}.`,
      );
    }

    const resolution =
      params.resolution ?? HIGGSFIELD_CINEMA_STUDIO_DEFAULT_RESOLUTION;
    const supportedResolution = HIGGSFIELD_CINEMA_STUDIO_RESOLUTIONS.find(
      (value) => value === resolution,
    );
    if (!supportedResolution) {
      throw new BadRequestException(
        `Higgsfield Cinema Studio resolution must be one of ${HIGGSFIELD_CINEMA_STUDIO_RESOLUTIONS.join(', ')}.`,
      );
    }

    const aspectRatio = params.aspectRatio ?? '16:9';
    const supportedAspectRatios: readonly string[] =
      ASPECT_RATIOS.HIGGSFIELD_CINEMA_STUDIO;
    if (!supportedAspectRatios.includes(aspectRatio)) {
      throw new BadRequestException(
        `Higgsfield Cinema Studio aspect ratio must be one of ${supportedAspectRatios.join(', ')}.`,
      );
    }

    const normalizeUrls = (
      urls: readonly string[] | undefined,
      label: string,
      max: number,
    ): string[] | undefined => {
      if (!urls || urls.length === 0) {
        return undefined;
      }
      // With a caller-supplied key the payload must stay byte-identical to
      // the first attempt, so URLs are validated but not trimmed or deduped.
      const normalized = params.idempotencyKey
        ? [...urls]
        : [...new Set(urls.map((url) => url.trim()))];
      if (
        normalized.length > max ||
        normalized.some((url) => !url.startsWith('https://'))
      ) {
        throw new BadRequestException(
          `Higgsfield Cinema Studio accepts at most ${max} https ${label} URLs.`,
        );
      }
      return normalized;
    };

    const imageUrls = normalizeUrls(
      params.imageUrls,
      'image',
      HIGGSFIELD_CINEMA_STUDIO_MAX_IMAGE_URLS,
    );
    const videoUrls = normalizeUrls(
      params.videoUrls,
      'video',
      HIGGSFIELD_CINEMA_STUDIO_MAX_VIDEO_URLS,
    );
    const audioUrls = normalizeUrls(
      params.audioUrls,
      'audio',
      HIGGSFIELD_CINEMA_STUDIO_MAX_AUDIO_URLS,
    );
    const input: HiggsFieldCinemaStudioInput = {
      aspect_ratio: aspectRatio,
      duration,
      generate_audio: params.generateAudio ?? true,
      prompt,
      resolution: supportedResolution,
      ...(imageUrls ? { image_urls: imageUrls } : {}),
      ...(videoUrls ? { video_urls: videoUrls } : {}),
      ...(audioUrls ? { audio_urls: audioUrls } : {}),
    };

    const submitted = await this.submit(
      MODEL_KEYS.HIGGSFIELD_CINEMA_STUDIO,
      input,
      {
        expectedCredentialFingerprint: params.expectedCredentialFingerprint,
        idempotencyKey: params.idempotencyKey ?? randomUUID(),
        onProviderSubmissionStarted: params.onProviderSubmissionStarted,
        organizationId: params.organizationId,
      },
    );

    return {
      requestId: submitted.request_id,
      status: submitted.status,
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
