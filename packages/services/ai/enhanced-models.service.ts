import type { IModel } from '@genfeedai/interfaces';
import { ModelProvider } from '@genfeedai/enums';
import { ModelsService } from '@services/ai/models.service';
import { FalProviderService } from '@services/ai/providers/fal/fal-provider.service';
import { HuggingFaceProviderService } from '@services/ai/providers/huggingface/huggingface-provider.service';
import { logger } from '@services/core/logger.service';

/**
 * Enhanced Models Service with Dynamic Provider Integration
 * Extends the base ModelsService with fal.ai dynamic discovery
 */
export class EnhancedModelsService extends ModelsService {
  private falProvider: FalProviderService;
  private hfProvider: HuggingFaceProviderService;
  private isInitialized = false;

  constructor(token: string) {
    super(token);
    this.falProvider = new FalProviderService();
    this.hfProvider = new HuggingFaceProviderService();
  }

  /**
   * Initialize the enhanced service with provider configuration
   */
  public async initialize(
    config: { falApiKey?: string; huggingFaceApiKey?: string } = {},
  ): Promise<void> {
    if (config.falApiKey) {
      this.falProvider.setApiKey(config.falApiKey);
    }
    if (config.huggingFaceApiKey) {
      this.hfProvider.setApiKey(config.huggingFaceApiKey);
    }
    this.isInitialized = true;
  }

  /**
   * Get all models including dynamically discovered ones
   */
  public async getAllModels(
    options: { includeInactive?: boolean; includeDynamic?: boolean } = {},
  ): Promise<IModel[]> {
    const { includeDynamic = true } = options;

    // Get existing models from base service
    const existingModels = await super.getAll();

    if (!includeDynamic || !this.isInitialized) {
      return existingModels;
    }

    // Get fal.ai models (predefined + discovered)
    const falModels = await this.getFalModels();

    // Get HuggingFace models (predefined + discovered)
    const hfModels = await this.getHuggingFaceModels();

    // Merge and deduplicate
    const allModels = [...existingModels];
    const dynamicModels = [...falModels, ...hfModels];

    for (const dynamicModel of dynamicModels) {
      const exists = existingModels.find((m) => m.key === dynamicModel.key);
      if (!exists && dynamicModel.key) {
        // Convert partial model to full model
        const fullModel = Object.assign({} as IModel, {
          createdAt: new Date(),
          id: this.generateId(),
          organizationId: null,
          updatedAt: new Date(),
          ...dynamicModel,
        });
        allModels.push(fullModel);
      }
    }

    return allModels;
  }

  /**
   * Get fal.ai models (predefined + dynamically discovered)
   */
  public async getFalModels(): Promise<Partial<IModel>[]> {
    if (!this.isInitialized) {
      return [];
    }

    try {
      // Start with predefined models
      const predefinedModels = this.falProvider.getPredefinedModels();

      // Add dynamically discovered models if API key is configured
      if (this.falProvider.isConfigured()) {
        const discoveredModels = await this.falProvider.discoverModels();
        return [...predefinedModels, ...discoveredModels];
      }

      return predefinedModels;
    } catch (error) {
      logger.error(
        'Enhanced Models Service: Failed to get fal.ai models',
        error,
      );
      return [];
    }
  }

  /**
   * Get HuggingFace models (predefined + dynamically discovered)
   */
  public async getHuggingFaceModels(): Promise<Partial<IModel>[]> {
    if (!this.isInitialized) {
      return [];
    }

    try {
      // Start with predefined models
      const predefinedModels = this.hfProvider.getPredefinedModels();

      // Add dynamically discovered models if API key is configured
      if (this.hfProvider.isConfigured()) {
        const discoveredModels = await this.hfProvider.discoverModels();
        return [...predefinedModels, ...discoveredModels];
      }

      return predefinedModels;
    } catch (error) {
      logger.error(
        'Enhanced Models Service: Failed to get HuggingFace models',
        error,
      );
      return [];
    }
  }

  /**
   * Get models by provider
   */
  public async getModelsByProvider(provider: ModelProvider): Promise<IModel[]> {
    const allModels = await this.getAllModels();
    return allModels.filter((model) => model.provider === provider);
  }

  /**
   * Sync fal.ai pricing for existing models
   */
  public async syncFalPricing(): Promise<{
    updated: number;
    errors: string[];
  }> {
    if (!this.falProvider.isConfigured()) {
      return { errors: ['FAL API key not configured'], updated: 0 };
    }

    const existingModels = await super.getAll();
    const falModels = existingModels.filter(
      (model) => model.provider === ModelProvider.FAL,
    );

    let updated = 0;
    const errors: string[] = [];

    for (const model of falModels) {
      try {
        const newCost = await this.falProvider.getModelPricing(model.key);
        if (newCost > 0 && newCost !== model.cost) {
          await super.update(model.id, {
            cost: newCost,
            updatedAt: new Date(),
          });
          updated++;
        }
      } catch (error) {
        errors.push(
          `Failed to update pricing for ${model.key}: ${error.message}`,
        );
      }
    }

    return { errors, updated };
  }

  /**
   * Add new fal.ai models to database
   */
  public async addDiscoveredFalModels(): Promise<{
    added: number;
    errors: string[];
  }> {
    if (!this.falProvider.isConfigured()) {
      return { added: 0, errors: ['FAL API key not configured'] };
    }

    const existingModels = await super.getAll();
    const existingKeys = new Set(existingModels.map((m) => m.key));

    const falModels = await this.getFalModels();
    const newModels = falModels.filter(
      (m) => m.key && !existingKeys.has(m.key),
    );

    let added = 0;
    const errors: string[] = [];

    for (const model of newModels) {
      try {
        const fullModel = {
          createdAt: new Date(),
          id: this.generateId(),
          organizationId: null,
          updatedAt: new Date(),
          ...model,
        };
        await super.create(fullModel as Record<string, unknown>);
        added++;
      } catch (error) {
        errors.push(`Failed to add ${model.key}: ${error.message}`);
      }
    }

    return { added, errors };
  }

  /**
   * Get enhanced model statistics
   */
  public async getModelStats(): Promise<{
    total: number;
    byProvider: Record<string, number>;
    byCategory: Record<string, number>;
    falConfigured: boolean;
    lastSync?: Date;
  }> {
    const allModels = await this.getAllModels();

    const byProvider: Record<string, number> = {};
    const byCategory: Record<string, number> = {};

    for (const model of allModels) {
      byProvider[model.provider] = (byProvider[model.provider] || 0) + 1;
      byCategory[model.category] = (byCategory[model.category] || 0) + 1;
    }

    return {
      byCategory,
      byProvider,
      falConfigured: this.falProvider.isConfigured(),
      huggingFaceConfigured: this.hfProvider.isConfigured(),
      lastSync: new Date(), // TODO: Store actual last sync time
      total: allModels.length,
    };
  }

  /**
   * Enhanced search with provider filtering
   */
  public async searchModels(query: {
    search?: string;
    provider?: ModelProvider;
    category?: string;
    costTier?: string;
    isActive?: boolean;
  }): Promise<IModel[]> {
    const allModels = await this.getAllModels();

    let filtered = allModels;

    if (query.search) {
      const search = query.search.toLowerCase();
      filtered = filtered.filter(
        (model) =>
          model.label.toLowerCase().includes(search) ||
          model.description?.toLowerCase().includes(search) ||
          model.key.toLowerCase().includes(search),
      );
    }

    if (query.provider) {
      filtered = filtered.filter((model) => model.provider === query.provider);
    }

    if (query.category) {
      filtered = filtered.filter((model) => model.category === query.category);
    }

    if (query.costTier) {
      filtered = filtered.filter((model) => model.costTier === query.costTier);
    }

    if (query.isActive !== undefined) {
      filtered = filtered.filter((model) => model.isActive === query.isActive);
    }

    return filtered;
  }

  /**
   * Generate a unique ID for new models
   */
  private generateId(): string {
    return `model_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get singleton instance with enhanced capabilities
   */
  public static getEnhancedInstance(token: string): EnhancedModelsService {
    const instance = new EnhancedModelsService(token);
    return instance;
  }
}
