import { ModelCategory, ModelKey, ModelProvider } from '@genfeedai/enums';
import { applyMargin } from '@genfeedai/helpers';
import type { IModel } from '@genfeedai/interfaces';
import { logger } from '@services/core/logger.service';

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
  size?: number;
  total?: number;
}

/**
 * FAL.AI Dynamic Provider Service
 * Discovers and manages 600+ fal.ai models with real-time pricing
 */
export class FalProviderService {
  private readonly baseUrl = 'https://fal.ai/api/models';
  private readonly pageSize = 200;
  private readonly provider = ModelProvider.FAL;
  private apiKey: string | null = null;
  private catalogCache: FalCatalogItem[] | null = null;

  constructor() {
    this.apiKey = process.env.FAL_API_KEY || null;
  }

  /**
   * Configure API key for fal.ai requests
   */
  public setApiKey(apiKey: string): void {
    this.apiKey = apiKey;
  }

  /**
   * Check if provider is configured
   */
  public isConfigured(): boolean {
    return this.apiKey !== null;
  }

  /**
   * Discover all available fal.ai models
   * Returns models mapped to GenFeed.AI format
   */
  public async discoverModels(): Promise<Partial<IModel>[]> {
    if (!this.isConfigured()) {
      throw new Error(
        'FAL_API_KEY not configured. Set it via setApiKey() or environment variable.',
      );
    }

    try {
      const models = await this.fetchFalModels();
      return models.map((model) => this.mapToGenFeedFormat(model));
    } catch (error) {
      logger.error('FAL Provider: Model discovery failed', error);
      return [];
    }
  }

  /**
   * Get real-time pricing for a specific model
   */
  public async getModelPricing(modelId: string): Promise<number> {
    if (!this.isConfigured()) {
      return 0;
    }

    try {
      const models = await this.fetchFalModels();
      const model = models.find((item) => item.id === modelId);
      if (!model) {
        logger.warn(`FAL Provider: Failed to find pricing for ${modelId}`);
        return 0;
      }

      const providerCostUsd = this.extractProviderCostUsd(model);
      return this.calculateCloudPricing(providerCostUsd);
    } catch (error) {
      logger.error(`FAL Provider: Pricing fetch failed for ${modelId}`, error);
      return 0;
    }
  }

  /**
   * Fetch models from fal.ai API
   */
  private async fetchFalModels(): Promise<FalCatalogItem[]> {
    if (this.catalogCache) {
      return this.catalogCache;
    }

    const models: FalCatalogItem[] = [];
    let page = 1;
    let totalPages = 1;

    while (page <= totalPages) {
      const response = await fetch(
        `${this.baseUrl}?page=${page}&size=${this.pageSize}`,
        {
          headers: {
            Authorization: `Key ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
        },
      );

      if (!response.ok) {
        throw new Error(
          `FAL API error: ${response.status} ${response.statusText}`,
        );
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

  /**
   * Map fal.ai model to GenFeed.AI format
   */
  private mapToGenFeedFormat(falModel: FalCatalogItem): Partial<IModel> {
    const modelId = falModel.id;
    const name = this.cleanModelName(falModel.title || modelId);
    const category = this.inferCategory(falModel);
    const key = this.generateModelKey(modelId);
    const providerCostUsd = this.extractProviderCostUsd(falModel);

    return {
      capabilities: this.extractCapabilities(falModel),
      category,
      cost: this.calculateCloudPricing(providerCostUsd),
      costPerUnit: providerCostUsd,
      costTier: this.getCostTier(providerCostUsd),
      description: falModel.shortDescription || `${name} via fal.ai`,
      isActive: true,
      isDefault: false,
      key: key as ModelKey,
      label: name,
      minCost: 2,
      pricingType: 'per-request',
      provider: this.provider,
      qualityTier: this.getQualityTier(falModel),
      speedTier: this.getSpeedTier(falModel),
    };
  }

  /**
   * Clean and normalize model names
   */
  private cleanModelName(name: string): string {
    return name
      .replace(/^fal-ai\//, '')
      .replace(/[-_]/g, ' ')
      .split(' ')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * Infer category from model metadata
   */
  private inferCategory(model: unknown): ModelCategory {
    const category = (model.category || '').toLowerCase();
    const id = (model.id || '').toLowerCase();
    const name = (model.title || '').toLowerCase();
    const tags = model.tags || [];

    if (category === 'text-to-image' || category === 'image-generation') {
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

    // Video models
    if (
      id.includes('video') ||
      id.includes('kling') ||
      id.includes('runway') ||
      id.includes('luma') ||
      name.includes('video') ||
      tags.includes('video')
    ) {
      return ModelCategory.VIDEO;
    }

    // Audio models
    if (
      id.includes('whisper') ||
      id.includes('tts') ||
      id.includes('speech') ||
      id.includes('voice') ||
      name.includes('audio') ||
      tags.includes('audio')
    ) {
      return ModelCategory.VOICE;
    }

    // Music models
    if (
      id.includes('music') ||
      id.includes('sound') ||
      tags.includes('music')
    ) {
      return ModelCategory.MUSIC;
    }

    // Text/LLM models
    if (
      id.includes('chat') ||
      id.includes('llm') ||
      id.includes('text') ||
      tags.includes('text') ||
      tags.includes('language')
    ) {
      return ModelCategory.TEXT;
    }

    // Image upscaling
    if (
      id.includes('upscal') ||
      id.includes('enhance') ||
      name.includes('upscale')
    ) {
      return ModelCategory.IMAGE_UPSCALE;
    }

    // Face swap / image editing
    if (id.includes('face') || id.includes('swap') || id.includes('edit')) {
      return ModelCategory.IMAGE_EDIT;
    }

    // Default to image generation
    return ModelCategory.IMAGE;
  }

  /**
   * Generate model key from fal.ai model ID
   */
  private generateModelKey(modelId: string): string {
    return modelId;
  }

  /**
   * Extract capabilities from model metadata
   */
  private extractCapabilities(model: FalCatalogItem): string[] {
    const capabilities: string[] = [];
    const category = (model.category || '').toLowerCase();
    const id = model.id.toLowerCase();

    if (
      category === 'image-to-image' ||
      category === 'image-to-video' ||
      category === 'video-to-video'
    ) {
      capabilities.push('Image Input');
    }

    if (
      category.startsWith('text-to-') ||
      category === 'image-to-video' ||
      category === 'text-to-image'
    ) {
      capabilities.push('Text Prompt');
    }

    if (id.includes('edit') || category === 'image-to-image') {
      capabilities.push('Image Editing');
    }

    if (id.includes('upscal') || id.includes('enhance')) {
      capabilities.push('Upscaling');
    }

    if (id.includes('seed')) {
      capabilities.push('Reproducible');
    }

    if (category === 'image-to-video' || category === 'text-to-video') {
      capabilities.push('Video Generation');
    }

    return capabilities;
  }

  /**
   * Calculate cloud pricing with 70% margin.
   * Returns credits (1 credit = $0.01).
   * Formula: sellPrice = providerCost / 0.30
   */
  private calculateCloudPricing(falCost: number): number {
    if (falCost <= 0) {
      return 2; // absolute minimum floor
    }
    return applyMargin(falCost);
  }

  /**
   * Determine cost tier based on pricing
   */
  private getCostTier(cost: number): 'low' | 'medium' | 'high' {
    if (cost < 0.01) {
      return 'low';
    }
    if (cost < 0.1) {
      return 'medium';
    }
    return 'high';
  }

  /**
   * Determine speed tier from model metadata
   */
  private getSpeedTier(model: unknown): 'fast' | 'medium' | 'slow' {
    const name = (model.title || '').toLowerCase();
    if (
      name.includes('turbo') ||
      name.includes('fast') ||
      name.includes('schnell')
    ) {
      return 'fast';
    }
    if (name.includes('slow') || name.includes('quality')) {
      return 'slow';
    }
    return 'medium';
  }

  /**
   * Determine quality tier from model metadata
   */
  private getQualityTier(
    model: unknown,
  ): 'basic' | 'standard' | 'high' | 'ultra' {
    const name = (model.title || '').toLowerCase();
    if (name.includes('ultra') || name.includes('pro')) {
      return 'ultra';
    }
    if (name.includes('high') || name.includes('quality')) {
      return 'high';
    }
    if (name.includes('basic') || name.includes('lite')) {
      return 'basic';
    }
    return 'standard';
  }

  /**
   * Get all predefined fal.ai models
   * Returns curated list with proper pricing
   */
  public getPredefinedModels(): Partial<IModel>[] {
    return [
      {
        capabilities: ['Text Prompt', 'Image Input', 'Reproducible'],
        category: ModelCategory.IMAGE,
        cost: 0.002,
        costPerUnit: 0.002,
        costTier: 'low',
        description: 'High-quality image generation with FLUX Dev model',
        isActive: true,
        isDefault: false,
        key: ModelKey.FAL_FLUX_DEV,
        label: 'FLUX Dev',
        minCost: 0.001,
        pricingType: 'per-request',
        provider: this.provider,
        qualityTier: 'high',
        speedTier: 'medium',
      },
      {
        capabilities: ['Text Prompt', 'Fast Generation', 'Reproducible'],
        category: ModelCategory.IMAGE,
        cost: 0.001,
        costPerUnit: 0.001,
        costTier: 'low',
        description: 'Fast image generation with FLUX Schnell model',
        isActive: true,
        isDefault: false,
        key: ModelKey.FAL_FLUX_SCHNELL,
        label: 'FLUX Schnell',
        minCost: 0.001,
        pricingType: 'per-request',
        provider: this.provider,
        qualityTier: 'standard',
        speedTier: 'fast',
      },
      {
        capabilities: ['Text Prompt', 'Image Input', 'High Quality'],
        category: ModelCategory.IMAGE,
        cost: 0.005,
        costPerUnit: 0.005,
        costTier: 'medium',
        description: 'Professional image generation with FLUX Pro model',
        isActive: true,
        isDefault: false,
        key: ModelKey.FAL_FLUX_PRO,
        label: 'FLUX Pro',
        minCost: 0.001,
        pricingType: 'per-request',
        provider: this.provider,
        qualityTier: 'ultra',
        speedTier: 'medium',
      },
      {
        capabilities: ['Text Prompt', 'Image to Video', 'Duration Control'],
        category: ModelCategory.VIDEO,
        cost: 0.15,
        costPerUnit: 0.15,
        costTier: 'high',
        description: 'High-quality video generation with Kling model',
        isActive: true,
        isDefault: false,
        key: ModelKey.FAL_KLING_VIDEO,
        label: 'Kling Video',
        minCost: 0.001,
        pricingType: 'per-request',
        provider: this.provider,
        qualityTier: 'high',
        speedTier: 'medium',
      },
      {
        capabilities: [
          'Text Prompt',
          'Image to Video',
          'Duration Control',
          'Audio Generation',
        ],
        category: ModelCategory.VIDEO,
        cost: 0.1,
        costPerUnit: 0.1,
        costTier: 'high',
        description:
          'Cinema-grade video generation with native audio by ByteDance',
        isActive: true,
        isDefault: false,
        key: ModelKey.FAL_SEEDANCE_2_0,
        label: 'Seedance 2.0',
        minCost: 0.001,
        pricingType: 'per-request',
        provider: this.provider,
        qualityTier: 'ultra',
        speedTier: 'medium',
      },
    ];
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
