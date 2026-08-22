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
const MODELS_PAGE_LIMIT = 50;
const PRICING_ENDPOINT_LIMIT = 50;
const REQUEST_TIMEOUT_MS = 30_000;

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

  async fetchModels(): Promise<IFalModel[]> {
    const models: IFalModel[] = [];
    let cursor: string | null = null;

    for (let page = 0; page < MAX_PAGES; page++) {
      const url = new URL(MODELS_URL);
      url.searchParams.set('expand', 'openapi-3.0');
      url.searchParams.set('limit', String(MODELS_PAGE_LIMIT));
      url.searchParams.set('status', 'active');
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

  async fetchPricing(
    endpoints: readonly string[],
  ): Promise<Array<Record<string, unknown>>> {
    const prices = new Map<string, Record<string, unknown>>();
    for (
      let offset = 0;
      offset < endpoints.length;
      offset += PRICING_ENDPOINT_LIMIT
    ) {
      const chunk = endpoints.slice(offset, offset + PRICING_ENDPOINT_LIMIT);
      let cursor: string | null = null;

      for (let page = 0; page < MAX_PAGES; page++) {
        const url = new URL(PRICING_URL);
        for (const endpoint of chunk)
          url.searchParams.append('endpoint_id', endpoint);
        if (cursor) url.searchParams.set('cursor', cursor);

        const data = await this.request<FalPricingResponse>(url);
        for (const price of data.prices ?? []) {
          const identity = JSON.stringify(price);
          prices.set(identity, price);
        }
        this.logger.log('FalPlatformClient fetched pricing page', {
          count: data.prices?.length ?? 0,
          page: page + 1,
        });
        if (!data.has_more || !data.next_cursor) break;
        cursor = data.next_cursor;
        if (page === MAX_PAGES - 1) {
          throw new Error(`Fal pricing pagination exceeded ${MAX_PAGES} pages`);
        }
      }
    }
    return [...prices.values()];
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
        if (attempt === MAX_ATTEMPTS) throw error;
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
    const retryAfter = response.headers.get('Retry-After');
    if (retryAfter) {
      const seconds = Number(retryAfter);
      if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000;
      const dateDelay = Date.parse(retryAfter) - Date.now();
      if (Number.isFinite(dateDelay) && dateDelay > 0) return dateDelay;
    }

    const reset = Number(response.headers.get('x-ratelimit-reset'));
    if (Number.isFinite(reset) && reset > 0) {
      const resetDelay = reset * 1_000 - Date.now();
      if (resetDelay > 0) return resetDelay;
    }
    return 250 * 2 ** (attempt - 1);
  }
}
