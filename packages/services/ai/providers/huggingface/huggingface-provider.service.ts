import type { IModel } from '@genfeedai/interfaces';
import { ModelCategory, ModelKey, ModelProvider } from '@genfeedai/enums';
import { logger } from '@services/core/logger.service';

/**
 * HuggingFace Dynamic Provider Service
 * Discovers and manages open-source models via HuggingFace Inference API
 */
export class HuggingFaceProviderService {
  private readonly baseUrl = 'https://huggingface.co/api';
  private readonly provider = ModelProvider.HUGGINGFACE;
  private apiKey: string | null = null;

  constructor() {
    this.apiKey = process.env.HUGGINGFACE_API_KEY || null;
  }

  /**
   * Configure API key for HuggingFace requests
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
   * Validate the API key by hitting HuggingFace whoami endpoint
   */
  public async validateApiKey(): Promise<boolean> {
    if (!this.apiKey) {
      return false;
    }

    try {
      const response = await fetch(`${this.baseUrl}/whoami`, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Health check for HuggingFace Inference API
   */
  public async healthCheck(): Promise<{
    status: 'ok' | 'error';
    message: string;
  }> {
    try {
      const response = await fetch(`${this.baseUrl}/models?limit=1`);
      if (response.ok) {
        return { message: 'HuggingFace API is reachable', status: 'ok' };
      }
      return { message: `API returned ${response.status}`, status: 'error' };
    } catch (error) {
      return {
        message: `API unreachable: ${(error as Error).message}`,
        status: 'error',
      };
    }
  }

  /**
   * Discover available models from HuggingFace API
   */
  public async discoverModels(options?: {
    task?: string;
    limit?: number;
    search?: string;
  }): Promise<Partial<IModel>[]> {
    if (!this.isConfigured()) {
      throw new Error(
        'HUGGINGFACE_API_KEY not configured. Set it via setApiKey() or environment variable.',
      );
    }

    try {
      const models = await this.fetchHuggingFaceModels(options);
      return models.map((model) => this.mapToGenFeedFormat(model));
    } catch (error) {
      logger.error('HuggingFace Provider: Model discovery failed', error);
      return [];
    }
  }

  /**
   * Search models by query string
   */
  public async searchModels(
    query: string,
    options?: {
      task?: string;
      limit?: number;
    },
  ): Promise<Partial<IModel>[]> {
    return this.discoverModels({
      limit: options?.limit || 20,
      search: query,
      task: options?.task,
    });
  }

  /**
   * Get model info from HuggingFace
   */
  public async getModelInfo(modelId: string): Promise<unknown> {
    try {
      const response = await fetch(`${this.baseUrl}/models/${modelId}`, {
        headers: this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {},
      });

      if (!response.ok) {
        return null;
      }

      return await response.json();
    } catch {
      return null;
    }
  }

  /**
   * Get pricing info for a model (free tier vs pro)
   */
  public getModelPricing(modelId: string): {
    tier: 'free' | 'pro';
    costPerRequest: number;
    rateLimit: string;
  } {
    // HuggingFace free tier models
    const freeModels = [
      'stabilityai/stable-diffusion-xl-base-1.0',
      'black-forest-labs/FLUX.1-schnell',
      'meta-llama/Llama-3.2-3B-Instruct',
      'mistralai/Mistral-7B-Instruct-v0.3',
      'openai/whisper-large-v3',
      'facebook/mms-tts-eng',
    ];

    const isFree = freeModels.includes(modelId);

    return {
      costPerRequest: isFree ? 0 : 0.001,
      rateLimit: isFree ? '1000 requests/day' : '10000 requests/day',
      tier: isFree ? 'free' : 'pro',
    };
  }

  /**
   * Fetch models from HuggingFace API
   */
  private async fetchHuggingFaceModels(options?: {
    task?: string;
    limit?: number;
    search?: string;
  }): Promise<unknown[]> {
    const params = new URLSearchParams();
    if (options?.task) {
      params.set('pipeline_tag', options.task);
    }
    if (options?.limit) {
      params.set('limit', String(options.limit));
    }
    if (options?.search) {
      params.set('search', options.search);
    }
    params.set('sort', 'downloads');
    params.set('direction', '-1');

    const url = `${this.baseUrl}/models?${params.toString()}`;
    const response = await fetch(url, {
      headers: this.apiKey
        ? {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          }
        : { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      throw new Error(
        `HuggingFace API error: ${response.status} ${response.statusText}`,
      );
    }

    const data = await response.json();
    return Array.isArray(data) ? data : data.models || [];
  }

  /**
   * Map HuggingFace model to GenFeed.AI format
   */
  private mapToGenFeedFormat(hfModel: unknown): Partial<IModel> {
    const modelId = hfModel.modelId || hfModel.id;
    const name = this.cleanModelName(modelId);
    const category = this.inferCategory(hfModel);
    const key = this.generateModelKey(modelId);
    const pricing = this.getModelPricing(modelId);

    return {
      capabilities: this.extractCapabilities(hfModel),
      category,
      cost: this.calculateCloudPricing(pricing.costPerRequest),
      costPerUnit: pricing.costPerRequest,
      costTier: pricing.tier === 'free' ? 'low' : 'medium',
      description: hfModel.description || `${name} via HuggingFace`,
      isActive: true,
      isDefault: false,
      key: key as ModelKey,
      label: name,
      minCost: 0,
      pricingType: 'per-request',
      provider: this.provider,
      qualityTier: this.getQualityTier(hfModel),
      speedTier: this.getSpeedTier(hfModel),
    };
  }

  /**
   * Clean and normalize model names
   */
  private cleanModelName(modelId: string): string {
    const name = modelId.split('/').pop() || modelId;
    return name
      .replace(/[-_]/g, ' ')
      .split(' ')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * Infer category from model metadata
   */
  private inferCategory(model: unknown): ModelCategory {
    const tag = (model.pipeline_tag || '').toLowerCase();
    const id = (model.modelId || model.id || '').toLowerCase();

    // Map HuggingFace pipeline tags to GenFeed categories
    if (tag === 'text-to-image' || tag === 'image-to-image') {
      return ModelCategory.IMAGE;
    }
    if (tag === 'text-to-video' || tag === 'image-to-video') {
      return ModelCategory.VIDEO;
    }
    if (
      tag === 'text-generation' ||
      tag === 'text2text-generation' ||
      tag === 'conversational' ||
      tag === 'question-answering' ||
      tag === 'summarization' ||
      tag === 'translation'
    ) {
      return ModelCategory.TEXT;
    }
    if (
      tag === 'automatic-speech-recognition' ||
      tag === 'text-to-speech' ||
      tag === 'audio-classification'
    ) {
      return ModelCategory.VOICE;
    }
    if (tag === 'text-to-audio') {
      return ModelCategory.MUSIC;
    }
    if (tag === 'image-segmentation' || tag === 'image-classification') {
      return ModelCategory.IMAGE_EDIT;
    }
    if (tag === 'image-super-resolution') {
      return ModelCategory.IMAGE_UPSCALE;
    }

    // Fallback: infer from model ID
    if (id.includes('video') || id.includes('vid')) {
      return ModelCategory.VIDEO;
    }
    if (id.includes('whisper') || id.includes('tts') || id.includes('speech')) {
      return ModelCategory.VOICE;
    }
    if (id.includes('llama') || id.includes('mistral') || id.includes('gpt')) {
      return ModelCategory.TEXT;
    }
    if (id.includes('stable-diffusion') || id.includes('flux')) {
      return ModelCategory.IMAGE;
    }

    return ModelCategory.IMAGE;
  }

  /**
   * Generate model key from HuggingFace model ID
   */
  private generateModelKey(modelId: string): string {
    const normalized = modelId
      .replace(/[^a-zA-Z0-9-_/.]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    return `hf/${normalized}`;
  }

  /**
   * Extract capabilities from model metadata
   */
  private extractCapabilities(model: unknown): string[] {
    const capabilities: string[] = [];
    const tag = model.pipeline_tag || '';

    if (tag.includes('text-to')) {
      capabilities.push('Text Prompt');
    }
    if (tag.includes('image-to')) {
      capabilities.push('Image Input');
    }
    if (tag === 'automatic-speech-recognition') {
      capabilities.push('Audio Input');
    }
    if (tag === 'text-to-speech') {
      capabilities.push('Text to Speech');
    }
    if (model.library_name === 'transformers') {
      capabilities.push('Transformers');
    }
    if (model.library_name === 'diffusers') {
      capabilities.push('Diffusers');
    }
    if (model.tags?.includes('gguf')) {
      capabilities.push('GGUF');
    }

    return capabilities;
  }

  /**
   * Calculate cloud pricing with 70% margin
   */
  private calculateCloudPricing(hfCost: number): number {
    if (hfCost === 0) {
      return 0;
    }
    const costWithMargin = hfCost * 1.7;
    return Math.max(costWithMargin, 0.001);
  }

  /**
   * Determine speed tier from model metadata
   */
  private getSpeedTier(model: unknown): 'fast' | 'medium' | 'slow' {
    const id = (model.modelId || model.id || '').toLowerCase();
    if (
      id.includes('schnell') ||
      id.includes('turbo') ||
      id.includes('fast') ||
      id.includes('tiny')
    ) {
      return 'fast';
    }
    if (id.includes('xl') || id.includes('large') || id.includes('405b')) {
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
    const id = (model.modelId || model.id || '').toLowerCase();
    if (id.includes('xl') || id.includes('large') || id.includes('pro')) {
      return 'high';
    }
    if (id.includes('tiny') || id.includes('small') || id.includes('mini')) {
      return 'basic';
    }
    if (id.includes('405b') || id.includes('ultra')) {
      return 'ultra';
    }
    return 'standard';
  }

  /**
   * Get all predefined HuggingFace models
   * Returns curated list of popular open-source models
   */
  public getPredefinedModels(): Partial<IModel>[] {
    return [
      // Image models
      {
        capabilities: ['Text Prompt', 'Diffusers', 'Reproducible'],
        category: ModelCategory.IMAGE,
        cost: 0,
        costPerUnit: 0,
        costTier: 'low',
        description:
          'High-quality image generation with Stable Diffusion XL via HuggingFace',
        isActive: true,
        isDefault: false,
        key: ModelKey.HF_SDXL,
        label: 'Stable Diffusion XL',
        minCost: 0,
        pricingType: 'per-request',
        provider: this.provider,
        qualityTier: 'high',
        speedTier: 'medium',
      },
      {
        capabilities: ['Text Prompt', 'Fast Generation', 'Diffusers'],
        category: ModelCategory.IMAGE,
        cost: 0,
        costPerUnit: 0,
        costTier: 'low',
        description:
          'Fast image generation with FLUX.1 Schnell via HuggingFace',
        isActive: true,
        isDefault: false,
        key: ModelKey.HF_FLUX_SCHNELL,
        label: 'FLUX.1 Schnell',
        minCost: 0,
        pricingType: 'per-request',
        provider: this.provider,
        qualityTier: 'standard',
        speedTier: 'fast',
      },
      // Text models
      {
        capabilities: ['Text Prompt', 'Transformers', 'Conversational'],
        category: ModelCategory.TEXT,
        cost: 0,
        costPerUnit: 0,
        costTier: 'low',
        description:
          'Meta Llama 3.2 3B Instruct for text generation via HuggingFace',
        isActive: true,
        isDefault: false,
        key: ModelKey.HF_LLAMA_3_2_3B,
        label: 'Llama 3.2 3B Instruct',
        minCost: 0,
        pricingType: 'per-request',
        provider: this.provider,
        qualityTier: 'standard',
        speedTier: 'fast',
      },
      {
        capabilities: ['Text Prompt', 'Transformers', 'Conversational'],
        category: ModelCategory.TEXT,
        cost: 0,
        costPerUnit: 0,
        costTier: 'low',
        description: 'Mistral 7B Instruct for text generation via HuggingFace',
        isActive: true,
        isDefault: false,
        key: ModelKey.HF_MISTRAL_7B,
        label: 'Mistral 7B Instruct v0.3',
        minCost: 0,
        pricingType: 'per-request',
        provider: this.provider,
        qualityTier: 'standard',
        speedTier: 'fast',
      },
      // Audio models
      {
        capabilities: ['Audio Input', 'Transformers', 'Multilingual'],
        category: ModelCategory.VOICE,
        cost: 0,
        costPerUnit: 0,
        costTier: 'low',
        description:
          'OpenAI Whisper Large v3 for speech recognition via HuggingFace',
        isActive: true,
        isDefault: false,
        key: ModelKey.HF_WHISPER_LARGE_V3,
        label: 'Whisper Large v3',
        minCost: 0,
        pricingType: 'per-request',
        provider: this.provider,
        qualityTier: 'high',
        speedTier: 'medium',
      },
      {
        capabilities: ['Text to Speech', 'Transformers'],
        category: ModelCategory.VOICE,
        cost: 0,
        costPerUnit: 0,
        costTier: 'low',
        description: 'Facebook MMS Text-to-Speech for English via HuggingFace',
        isActive: true,
        isDefault: false,
        key: ModelKey.HF_MMS_TTS_ENG,
        label: 'MMS TTS English',
        minCost: 0,
        pricingType: 'per-request',
        provider: this.provider,
        qualityTier: 'standard',
        speedTier: 'fast',
      },
      // Video models
      {
        capabilities: ['Image Input', 'Diffusers', 'Video Generation'],
        category: ModelCategory.VIDEO,
        cost: 0.001,
        costPerUnit: 0.001,
        costTier: 'low',
        description:
          'Stable Video Diffusion for image-to-video generation via HuggingFace',
        isActive: true,
        isDefault: false,
        key: ModelKey.HF_STABLE_VIDEO_DIFFUSION,
        label: 'Stable Video Diffusion',
        minCost: 0,
        pricingType: 'per-request',
        provider: this.provider,
        qualityTier: 'high',
        speedTier: 'slow',
      },
    ];
  }
}
