import { LoggerService } from '@libs/logger/logger.service';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@workers/config/config.service';
import type {
  IFalModel,
  IFalModelsResponse,
} from '@workers/interfaces/model-discovery.interface';

export const FAL_PLATFORM_CLIENT_OPTIONS = Symbol(
  'FAL_PLATFORM_CLIENT_OPTIONS',
);

export interface FalPlatformClientOptions {
  fetcher?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
}

export interface FalPricingResponse {
  has_more: boolean;
  next_cursor: string | null;
  prices: Array<Record<string, unknown>>;
}

const MODELS_URL = 'https://api.fal.ai/v1/models';
const PRICING_URL = 'https://api.fal.ai/v1/models/pricing';
const MAX_ATTEMPTS = 3;
const MAX_PAGES = 100;
/** Fal rejects `limit` above 10 when `expand=openapi-3.0` is requested. */
const MODELS_ENDPOINT_LIMIT = 10;
const PRICING_ENDPOINT_LIMIT = 50;
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RETRY_DELAY_MS = 30_000;

/**
 * Fal answers 404 for the whole request when any one requested endpoint is not
 * addressable by its exact id, so callers split the batch to isolate it.
 */
export class FalEndpointNotFoundError extends Error {
  override readonly name = 'FalEndpointNotFoundError';
}

@Injectable()
export class FalPlatformClient {
  private readonly fetcher: typeof fetch;
  private readonly sleep: (milliseconds: number) => Promise<void>;

  constructor(
    private readonly logger: LoggerService,
    private readonly config: ConfigService,
    @Optional()
    @Inject(FAL_PLATFORM_CLIENT_OPTIONS)
    options?: FalPlatformClientOptions,
  ) {
    this.fetcher = options?.fetcher ?? globalThis.fetch;
    this.sleep =
      options?.sleep ??
      ((milliseconds) =>
        new Promise((resolve) => setTimeout(resolve, milliseconds)));
  }

  /**
   * OpenAPI-expanded metadata for exactly these endpoints. Endpoints fal cannot
   * address by exact id are left out of the result.
   */
  async fetchModels(endpoints: readonly string[]): Promise<IFalModel[]> {
    const models = new Map<string, IFalModel>();
    for (const chunk of this.chunks(endpoints, MODELS_ENDPOINT_LIMIT)) {
      for (const model of await this.isolatingMissingEndpoints(chunk, (ids) =>
        this.fetchModelChunk(ids),
      ))
        models.set(model.endpoint_id, model);
    }
    return [...models.values()];
  }

  async fetchPricing(
    endpoints: readonly string[],
  ): Promise<Array<Record<string, unknown>>> {
    const prices = new Map<string, Record<string, unknown>>();
    for (const chunk of this.chunks(endpoints, PRICING_ENDPOINT_LIMIT)) {
      for (const price of await this.isolatingMissingEndpoints(chunk, (ids) =>
        this.fetchPricingChunk(ids),
      ))
        prices.set(JSON.stringify(price), price);
    }
    return [...prices.values()];
  }

  private async fetchModelChunk(
    endpoints: readonly string[],
  ): Promise<IFalModel[]> {
    const models: IFalModel[] = [];
    let cursor: string | null = null;

    for (let page = 0; page < MAX_PAGES; page++) {
      const url = new URL(MODELS_URL);
      url.searchParams.set('expand', 'openapi-3.0');
      url.searchParams.set('limit', String(MODELS_ENDPOINT_LIMIT));
      for (const endpoint of endpoints)
        url.searchParams.append('endpoint_id', endpoint);
      if (cursor) url.searchParams.set('cursor', cursor);

      const data = await this.request<IFalModelsResponse>(url);
      models.push(...(data.models ?? []));
      this.logger.log('FalPlatformClient fetched model page', {
        count: data.models?.length ?? 0,
        page: page + 1,
      });
      if (!data.has_more || !data.next_cursor) return models;
      cursor = data.next_cursor;
    }

    throw new Error(`Fal model pagination exceeded ${MAX_PAGES} pages`);
  }

  private async fetchPricingChunk(
    endpoints: readonly string[],
  ): Promise<Array<Record<string, unknown>>> {
    const prices: Array<Record<string, unknown>> = [];
    let cursor: string | null = null;

    for (let page = 0; page < MAX_PAGES; page++) {
      const url = new URL(PRICING_URL);
      for (const endpoint of endpoints)
        url.searchParams.append('endpoint_id', endpoint);
      if (cursor) url.searchParams.set('cursor', cursor);

      const data = await this.request<FalPricingResponse>(url);
      prices.push(...(data.prices ?? []));
      this.logger.log('FalPlatformClient fetched pricing page', {
        count: data.prices?.length ?? 0,
        page: page + 1,
      });
      if (!data.has_more || !data.next_cursor) return prices;
      cursor = data.next_cursor;
    }

    throw new Error(`Fal pricing pagination exceeded ${MAX_PAGES} pages`);
  }

  /** On a batch 404, retry each endpoint alone and drop the unaddressable ones. */
  private async isolatingMissingEndpoints<T>(
    endpoints: readonly string[],
    fetchChunk: (endpoints: readonly string[]) => Promise<T[]>,
  ): Promise<T[]> {
    try {
      return await fetchChunk(endpoints);
    } catch (error: unknown) {
      if (!(error instanceof FalEndpointNotFoundError)) throw error;
      if (endpoints.length === 1) {
        this.logger.warn('FalPlatformClient endpoint not addressable', {
          endpoint: endpoints[0],
        });
        return [];
      }
      const results: T[] = [];
      for (const endpoint of endpoints)
        results.push(
          ...(await this.isolatingMissingEndpoints([endpoint], fetchChunk)),
        );
      return results;
    }
  }

  private chunks(
    values: readonly string[],
    size: number,
  ): Array<readonly string[]> {
    const unique = [...new Set(values)];
    const chunks: Array<readonly string[]> = [];
    for (let offset = 0; offset < unique.length; offset += size)
      chunks.push(unique.slice(offset, offset + size));
    return chunks;
  }

  private getToken(): string {
    const token = this.config.get('FAL_API_KEY');
    if (!token) {
      throw new Error('FAL_API_KEY is not configured');
    }
    return token;
  }

  private async request<T>(url: URL): Promise<T> {
    let lastStatus = 0;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        const response = await this.fetcher(url.toString(), {
          headers: { Authorization: `Key ${this.getToken()}` },
          method: 'GET',
          signal: controller.signal,
        });
        lastStatus = response.status;
        if (response.ok) return (await response.json()) as T;
        if (response.status === 404)
          throw new FalEndpointNotFoundError(
            'Fal could not address a requested endpoint',
          );

        if (!this.isRetryable(response.status) || attempt === MAX_ATTEMPTS) {
          break;
        }
        const delayMs = this.retryDelayMs(response, attempt);
        this.logger.warn('Fal platform request retry scheduled', {
          attempt,
          delayMs,
          status: response.status,
        });
        await this.sleep(delayMs);
      } catch (error: unknown) {
        if (
          error instanceof FalEndpointNotFoundError ||
          attempt === MAX_ATTEMPTS
        )
          throw error;
        const delayMs = 250 * 2 ** (attempt - 1);
        this.logger.warn('Fal platform transport retry scheduled', {
          attempt,
          delayMs,
          reason: error instanceof Error ? error.name : 'unknown',
        });
        await this.sleep(delayMs);
      } finally {
        clearTimeout(timeout);
      }
    }

    throw new Error(
      `Fal platform request failed after ${MAX_ATTEMPTS} attempts (${lastStatus})`,
    );
  }

  private isRetryable(status: number): boolean {
    return status === 429 || status >= 500;
  }

  private retryDelayMs(response: Response, attempt: number): number {
    const clampDelay = (delayMs: number) =>
      Math.min(delayMs, MAX_RETRY_DELAY_MS);
    const retryAfter = response.headers.get('Retry-After');
    if (retryAfter) {
      const seconds = Number(retryAfter);
      if (Number.isFinite(seconds) && seconds >= 0) {
        return clampDelay(seconds * 1_000);
      }
      const dateDelay = Date.parse(retryAfter) - Date.now();
      if (Number.isFinite(dateDelay) && dateDelay > 0) {
        return clampDelay(dateDelay);
      }
    }

    const reset = Number(response.headers.get('x-ratelimit-reset'));
    if (Number.isFinite(reset) && reset > 0) {
      const resetDelay = reset * 1_000 - Date.now();
      if (resetDelay > 0) return clampDelay(resetDelay);
    }
    return clampDelay(250 * 2 ** (attempt - 1));
  }
}
