import { ModelCategory, ModelProvider } from '@genfeedai/enums';
import { applyMargin } from '@genfeedai/helpers';
import type { IModel } from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@workers/config/config.service';

/** Timeout for HuggingFace API requests */
const API_TIMEOUT_MS = 30_000;

/** Maximum number of models to fetch per page */
const PAGE_SIZE = 100;

/** Maximum pages to iterate to prevent runaway polling */
const MAX_PAGES = 5;

/**
 * Minimum download count for a model to be considered for discovery.
 * Filters out the long tail of experimental / spam models.
 * HuggingFace has 500k+ models; this keeps the queue to established ones only.
 */
const MIN_DOWNLOADS = 1_000;

/**
 * Minimum like count as a secondary quality signal.
 * Requires at least some community validation beyond raw download numbers.
 */
const MIN_LIKES = 10;

/**
 * Pipeline tags from the HuggingFace Hub API that map to content-creation categories.
 * Allowlist — only these tags are considered for auto-discovery.
 */
const ALLOWED_PIPELINE_TAGS: ReadonlySet<string> = new Set([
  'text-to-image',
  'image-to-image',
  'image-to-video',
  'text-to-video',
  'text-to-audio',
  'text-to-speech',
  'automatic-speech-recognition',
  'text-generation',
  'text2text-generation',
]);

/**
 * Pipeline tags that are explicitly excluded from auto-discovery.
 * These represent non-content-creation use cases.
 */
const DENIED_PIPELINE_TAGS: ReadonlySet<string> = new Set([
  'feature-extraction',
  'sentence-similarity',
  'fill-mask',
  'token-classification',
  'named-entity-recognition',
  'question-answering',
  'zero-shot-classification',
  'object-detection',
  'image-classification',
  'image-segmentation',
  'video-classification',
  'reinforcement-learning',
  'robotics',
  'tabular-classification',
  'tabular-regression',
  'time-series-forecasting',
  'graph-ml',
]);

interface HuggingFaceModel {
  id: string;
  modelId?: string;
  pipeline_tag?: string;
  tags?: string[];
  downloads?: number;
  likes?: number;
  gated?: boolean | string;
  private?: boolean;
  cardData?: {
    license?: string;
    language?: string[];
  };
}

/**
 * NestJS service for discovering content-creation models from HuggingFace Hub.
 * Uses the public HuggingFace Hub API — no SDK dependency.
 */
@Injectable()
export class HuggingFaceDiscoveryService {
  private readonly context = HuggingFaceDiscoveryService.name;
  private readonly baseUrl = 'https://huggingface.co/api/models';
  private readonly apiKey: string | null;

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
  ) {
    this.apiKey = this.configService.get('HUGGINGFACE_API_KEY') || null;

    if (this.apiKey) {
      this.logger.log(`${this.context} initialized with HUGGINGFACE_API_KEY`);
    } else {
      this.logger.warn(
        `${this.context} HUGGINGFACE_API_KEY not configured — unauthenticated requests will be rate-limited`,
      );
    }
  }

  /**
   * Check if HuggingFace provider is configured with an API key.
   * Discovery can still run without a key but is rate-limited.
   */
  isConfigured(): boolean {
    return this.apiKey !== null;
  }

  /**
   * Discover content-creation models from HuggingFace Hub.
   * Fetches models for each allowed pipeline tag and returns them
   * mapped to GenFeed.AI IModel format.
   */
  async discoverModels(): Promise<Partial<IModel>[]> {
    const discovered: Partial<IModel>[] = [];
    const seenIds = new Set<string>();

    for (const tag of ALLOWED_PIPELINE_TAGS) {
      try {
        const models = await this.fetchModelsForTag(tag);

        for (const model of models) {
          const key = this.buildModelKey(model);
          if (seenIds.has(key)) {
            continue;
          }
          seenIds.add(key);
          discovered.push(this.mapToGenFeedFormat(model, tag));
        }
      } catch (error: unknown) {
        this.logger.error(
          `${this.context} failed to fetch models for tag "${tag}"`,
          { error },
        );
      }
    }

    this.logger.log(
      `${this.context} discovered ${discovered.length} models across ${ALLOWED_PIPELINE_TAGS.size} pipeline tags`,
    );

    return discovered;
  }

  /**
   * Fetch models from HuggingFace Hub for a specific pipeline tag.
   * Paginates using the `Link` header cursor.
   */
  private async fetchModelsForTag(
    pipelineTag: string,
  ): Promise<HuggingFaceModel[]> {
    const models: HuggingFaceModel[] = [];
    let pageCount = 0;
    let nextUrl: string | null =
      `${this.baseUrl}?pipeline_tag=${encodeURIComponent(pipelineTag)}&limit=${PAGE_SIZE}&sort=downloads&direction=-1`;

    while (nextUrl && pageCount < MAX_PAGES) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

      const headers: Record<string, string> = {
        Accept: 'application/json',
      };

      if (this.apiKey) {
        headers.Authorization = `Bearer ${this.apiKey}`;
      }

      let response: Response;
      try {
        response = await fetch(nextUrl, {
          headers,
          method: 'GET',
          signal: controller.signal,
        });
      } catch (error: unknown) {
        clearTimeout(timeoutId);
        if ((error as Error)?.name === 'AbortError') {
          this.logger.error(
            `${this.context} request timed out for tag "${pipelineTag}" page ${pageCount + 1}`,
          );
        } else {
          this.logger.error(
            `${this.context} fetch error for tag "${pipelineTag}" page ${pageCount + 1}`,
            { error },
          );
        }
        break;
      }

      clearTimeout(timeoutId);

      if (!response.ok) {
        this.logger.error(
          `${this.context} HuggingFace API returned ${response.status} for tag "${pipelineTag}"`,
        );
        break;
      }

      const data = (await response.json()) as HuggingFaceModel[];

      let reachedThreshold = false;
      if (Array.isArray(data) && data.length > 0) {
        const filtered = data.filter((m) => this.isEligible(m));
        models.push(...filtered);

        // Results are sorted by downloads desc — once the last model on this
        // page falls below MIN_DOWNLOADS there is no point fetching more pages.
        const lastModel = data.at(-1);
        if (lastModel && (lastModel.downloads ?? 0) < MIN_DOWNLOADS) {
          reachedThreshold = true;
        }
      }

      // HuggingFace uses Link header for pagination cursor
      const linkHeader = response.headers.get('Link');
      nextUrl = this.extractNextUrl(linkHeader);
      pageCount++;

      this.logger.log(
        `${this.context} fetched page ${pageCount} for tag "${pipelineTag}" — ${data.length ?? 0} items (filtered: ${models.length} total so far)`,
      );

      if (!Array.isArray(data) || data.length < PAGE_SIZE || reachedThreshold) {
        break;
      }
    }

    return models;
  }

  /**
   * Determine if a HuggingFace model is eligible for auto-discovery.
   * Excludes gated, private, denied-tag, and low-popularity models.
   */
  private isEligible(model: HuggingFaceModel): boolean {
    if (model.private === true) {
      return false;
    }

    if (model.gated === true || model.gated === 'auto') {
      return false;
    }

    const tag = model.pipeline_tag ?? '';
    if (DENIED_PIPELINE_TAGS.has(tag)) {
      return false;
    }

    if ((model.downloads ?? 0) < MIN_DOWNLOADS) {
      return false;
    }

    if ((model.likes ?? 0) < MIN_LIKES) {
      return false;
    }

    return true;
  }

  /**
   * Map a HuggingFace model to GenFeed.AI IModel format.
   * Cost is 0 by default since HuggingFace pricing varies by deployment.
   */
  private mapToGenFeedFormat(
    model: HuggingFaceModel,
    pipelineTag: string,
  ): Partial<IModel> {
    const key = this.buildModelKey(model);
    const label = this.buildLabel(model.id);
    const category = this.inferCategory(pipelineTag, model);

    return {
      capabilities: [],
      category,
      cost: applyMargin(0),
      description: `${label} — HuggingFace model (${pipelineTag})`,
      isActive: false,
      isDefault: false,
      key: key as IModel['key'],
      label,
      minCost: 0,
      provider: ModelProvider.HUGGINGFACE,
      providerCostUsd: 0,
    };
  }

  /**
   * Build a stable model key from the HuggingFace model ID.
   * Uses the model ID directly as it's already namespaced (e.g. "black-forest-labs/FLUX.1-dev").
   */
  private buildModelKey(model: HuggingFaceModel): string {
    return model.id || model.modelId || '';
  }

  /**
   * Build a human-readable label from the model ID.
   * @example "black-forest-labs/FLUX.1-dev" → "FLUX.1-dev"
   */
  private buildLabel(modelId: string): string {
    const parts = modelId.split('/');
    const name = parts.at(-1) ?? modelId;
    return name.replace(/[-_]/g, ' ').trim();
  }

  /**
   * Infer the GenFeed.AI ModelCategory from the HuggingFace pipeline tag.
   */
  private inferCategory(
    pipelineTag: string,
    model: HuggingFaceModel,
  ): ModelCategory {
    const id = (model.id || '').toLowerCase();

    switch (pipelineTag) {
      case 'text-to-image':
        return ModelCategory.IMAGE;
      case 'image-to-image':
        if (id.includes('upscal') || id.includes('enhance')) {
          return ModelCategory.IMAGE_UPSCALE;
        }
        return ModelCategory.IMAGE_EDIT;
      case 'image-to-video':
      case 'text-to-video':
        return ModelCategory.VIDEO;
      case 'text-to-audio':
      case 'text-to-music':
        return ModelCategory.MUSIC;
      case 'text-to-speech':
      case 'automatic-speech-recognition':
        return ModelCategory.VOICE;
      case 'text-generation':
      case 'text2text-generation':
        return ModelCategory.TEXT;
      default:
        return ModelCategory.IMAGE;
    }
  }

  /**
   * Extract the next page URL from the HuggingFace Link header.
   * Format: `<url>; rel="next"`
   */
  private extractNextUrl(linkHeader: string | null): string | null {
    if (!linkHeader) {
      return null;
    }

    const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
    return match ? match[1] : null;
  }
}
