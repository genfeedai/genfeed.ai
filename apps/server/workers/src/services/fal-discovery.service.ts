import type { IModel } from '@genfeedai/interfaces';
import { ModelCategory, ModelProvider } from '@genfeedai/enums';
import { applyMargin } from '@genfeedai/helpers';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@workers/config/config.service';

/** Timeout for fal.ai API requests */
const API_TIMEOUT_MS = 30_000;
const PAGE_SIZE = 200;

interface FalCatalogItem {
  category?: string;
  deprecated?: boolean;
  id: string;
  pricingInfoOverride?: string;
  removed?: boolean;
  shortDescription?: string;
  tags?: string[];
  title?: string;
}

interface FalCatalogResponse {
  items?: FalCatalogItem[];
  models?: FalCatalogItem[];
  page?: number;
  pages?: number;
}

/**
 * NestJS service for discovering and pricing fal.ai models.
 * Self-contained — does not depend on packages/services path alias.
 */
@Injectable()
export class FalDiscoveryService {
  private readonly context = FalDiscoveryService.name;
  private readonly baseUrl = 'https://fal.ai/api/models';
  private readonly apiKey: string | null;
  private catalogCache: FalCatalogItem[] | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
  ) {
    this.apiKey = this.configService.get('FAL_API_KEY') || null;

    if (this.apiKey) {
      this.logger.log(`${this.context} initialized with FAL_API_KEY`);
    } else {
      this.logger.warn(`${this.context} FAL_API_KEY not configured`);
    }
  }

  /**
   * Check if fal.ai provider is configured with an API key
   */
  isConfigured(): boolean {
    return this.apiKey !== null;
  }

  /**
   * Discover all available fal.ai models.
   * Returns models mapped to GenFeed.AI IModel format.
   */
  async discoverModels(): Promise<Partial<IModel>[]> {
    if (!this.isConfigured()) {
      this.logger.warn(
        `${this.context} skipping discovery — FAL_API_KEY not configured`,
      );
      return [];
    }

    try {
      const models = await this.fetchFalModels();
      return models.map((model) => this.mapToGenFeedFormat(model));
    } catch (error: unknown) {
      if ((error as Error)?.name === 'AbortError') {
        this.logger.error(`${this.context} fal.ai API request timed out`);
      } else {
        this.logger.error(`${this.context} discovery failed`, error);
      }
      return [];
    }
  }

  /**
   * Get real-time pricing for a specific fal.ai model.
   * Returns cost in credits (with 70% margin applied).
   */
  async getModelPricing(modelId: string): Promise<number> {
    if (!this.isConfigured()) {
      return 0;
    }

    try {
      const models = await this.fetchFalModels();
      const model = models.find((item) => item.id === modelId);
      if (!model) {
        this.logger.warn(
          `${this.context} failed to get pricing for ${modelId}`,
        );
        return 0;
      }

      const costPerRequest = this.extractProviderCostUsd(model);

      if (costPerRequest <= 0) {
        return 2; // absolute minimum floor
      }

      return applyMargin(costPerRequest);
    } catch (error: unknown) {
      this.logger.error(
        `${this.context} pricing fetch failed for ${modelId}`,
        error,
      );
      return 0;
    }
  }

  /**
   * Map a fal.ai model object to GenFeed.AI IModel format
   */
  private mapToGenFeedFormat(falModel: FalCatalogItem): Partial<IModel> {
    const modelId = falModel.id;
    const name = this.cleanModelName(falModel.title || modelId);
    const category = this.inferCategory(falModel);
    const key = this.generateModelKey(modelId);
    const costPerRequest = this.extractProviderCostUsd(falModel);

    return {
      capabilities: [],
      category,
      cost: costPerRequest > 0 ? applyMargin(costPerRequest) : 2,
      costPerUnit: costPerRequest,
      description: falModel.shortDescription || `${name} via fal.ai`,
      isActive: false, // drafts start inactive
      isDefault: false,
      key: key as IModel['key'],
      label: name,
      minCost: 2,
      provider: ModelProvider.FAL,
      providerCostUsd: costPerRequest,
    };
  }

  private cleanModelName(name: string): string {
    return name
      .replace(/^fal-ai\//, '')
      .replace(/[-_]/g, ' ')
      .split(' ')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  private inferCategory(model: FalCatalogItem): ModelCategory {
    const category = (model.category || '').toLowerCase();
    const id = model.id.toLowerCase();
    const name = (model.title || '').toLowerCase();
    const tags = model.tags || [];

    if (category === 'text-to-image') {
      return ModelCategory.IMAGE;
    }

    if (category === 'image-to-image') {
      if (
        id.includes('upscal') ||
        id.includes('enhance') ||
        name.includes('upscale')
      ) {
        return ModelCategory.IMAGE_UPSCALE;
      }

      return ModelCategory.IMAGE_EDIT;
    }

    if (
      category === 'text-to-video' ||
      category === 'image-to-video' ||
      category === 'video-to-video'
    ) {
      return ModelCategory.VIDEO;
    }

    if (
      category === 'speech-to-text' ||
      category === 'text-to-speech' ||
      category === 'audio-to-text'
    ) {
      return ModelCategory.VOICE;
    }

    if (
      category === 'text-to-audio' ||
      category === 'text-to-music' ||
      category === 'music'
    ) {
      return ModelCategory.MUSIC;
    }

    if (
      id.includes('video') ||
      name.includes('video') ||
      tags.includes('video')
    ) {
      return ModelCategory.VIDEO;
    }
    if (
      id.includes('whisper') ||
      id.includes('tts') ||
      id.includes('voice') ||
      tags.includes('audio')
    ) {
      return ModelCategory.VOICE;
    }
    if (id.includes('music') || tags.includes('music')) {
      return ModelCategory.MUSIC;
    }
    if (id.includes('chat') || id.includes('llm') || tags.includes('text')) {
      return ModelCategory.TEXT;
    }
    if (id.includes('upscal') || id.includes('enhance')) {
      return ModelCategory.IMAGE_UPSCALE;
    }
    if (id.includes('edit') || id.includes('inpaint')) {
      return ModelCategory.IMAGE_EDIT;
    }

    return ModelCategory.IMAGE;
  }

  private generateModelKey(modelId: string): string {
    return modelId;
  }

  private async fetchFalModels(): Promise<FalCatalogItem[]> {
    if (this.catalogCache) {
      return this.catalogCache;
    }

    const models: FalCatalogItem[] = [];
    let page = 1;
    let totalPages = 1;

    while (page <= totalPages) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

      const response = await fetch(
        `${this.baseUrl}?page=${page}&size=${PAGE_SIZE}`,
        {
          headers: {
            Authorization: `Key ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          signal: controller.signal,
        },
      );

      clearTimeout(timeoutId);

      if (!response.ok) {
        this.logger.error(
          `${this.context} fal.ai API returned ${response.status}`,
        );
        return [];
      }

      const data = (await response.json()) as
        | FalCatalogResponse
        | FalCatalogItem[];
      const pageItems = this.extractCatalogItems(data);
      models.push(...pageItems);

      if (Array.isArray(data)) {
        totalPages = page;
      } else {
        totalPages = Math.max(data.pages || page, page);
      }

      page += 1;
    }

    this.catalogCache = models.filter(
      (model) =>
        Boolean(model.id) &&
        model.removed !== true &&
        model.deprecated !== true &&
        model.id.startsWith('fal-ai/'),
    );

    return this.catalogCache;
  }

  private extractCatalogItems(
    data: FalCatalogResponse | FalCatalogItem[],
  ): FalCatalogItem[] {
    if (Array.isArray(data)) {
      return data;
    }

    if (Array.isArray(data.items)) {
      return data.items;
    }

    if (Array.isArray(data.models)) {
      return data.models;
    }

    return [];
  }

  private extractProviderCostUsd(model: FalCatalogItem): number {
    const pricingText = model.pricingInfoOverride || '';
    const match = pricingText.match(/\$([0-9]+(?:\.[0-9]+)?)/);
    return match ? Number(match[1]) : 0;
  }
}
