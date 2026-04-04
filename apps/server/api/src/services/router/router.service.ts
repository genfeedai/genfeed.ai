import type { ModelDocument } from '@api/collections/models/schemas/model.schema';
import { ModelsService } from '@api/collections/models/services/models.service';
import { DEFAULT_TEXT_MODEL } from '@api/constants/default-text-model.constant';
import type {
  ModelRecommendation,
  ModelSelectionOptions,
  PromptAnalysis,
} from '@api/services/router/interfaces/router.interfaces';
import { ModelCategory, ModelKey } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, NotFoundException } from '@nestjs/common';

const DEFAULT_IMAGE_MODEL = ModelKey.REPLICATE_GOOGLE_NANO_BANANA;
const DEFAULT_VIDEO_MODEL = ModelKey.REPLICATE_GOOGLE_VEO_3_1;

@Injectable()
export class RouterService {
  /**
   * Score weights for quality tiers
   */
  private static readonly QUALITY_TIER_SCORES: Record<string, number> = {
    high: 10,
    standard: 5,
    ultra: 15,
  };

  /**
   * Score weights for quality indicators by tier
   */
  private static readonly QUALITY_INDICATOR_SCORES: Record<string, number> = {
    high: 15,
    ultra: 25,
  };

  /**
   * Score weights for style capabilities
   */
  private static readonly STYLE_CAPABILITY_SCORES: Record<string, number> = {
    artistic: 15,
    creative: 15,
    stylized: 20,
  };

  constructor(
    private readonly logger: LoggerService,
    private readonly modelsService: ModelsService,
  ) {}

  /**
   * Get all active models for a category from the database
   */
  private async getModelsByCategory(
    category: ModelCategory,
  ): Promise<ModelDocument[]> {
    // Since ModelsService.findAllActive() returns all active non-deleted models,
    // we filter in memory for the specific category
    const allActive = await this.modelsService.findAllActive();
    return allActive.filter((m) => m.category === category);
  }

  /**
   * Score a model based on prompt analysis and user options
   * Higher score = better match
   */
  private scoreModel(
    model: ModelDocument,
    analysis: PromptAnalysis,
    options: ModelSelectionOptions,
  ): number {
    let score = 0;
    const { prioritize = 'balanced' } = options;

    score += this.scorePriority(model, prioritize);
    score += this.scoreQualityTier(model, prioritize);
    score += this.scoreAnalysisMatch(model, analysis);
    score += this.scoreKeywordMatch(model, analysis);
    score += this.scoreDimensions(model, options);
    score += this.scoreFeatures(model, options);
    score += this.scoreComplexity(model, analysis);
    score += this.scoreModelFlags(model);

    return score;
  }

  /**
   * Score based on user priority preference
   */
  private scorePriority(model: ModelDocument, prioritize: string): number {
    if (prioritize === 'speed' && model.speedTier === 'fast') {
      return 50;
    }
    if (prioritize === 'cost' && model.costTier === 'low') {
      return 50;
    }
    if (prioritize === 'quality' && model.qualityTier === 'ultra') {
      return 50;
    }
    if (prioritize === 'quality' && model.qualityTier === 'high') {
      return 30;
    }
    return 0;
  }

  /**
   * Score based on quality tier (when not prioritizing quality)
   */
  private scoreQualityTier(model: ModelDocument, prioritize: string): number {
    if (prioritize === 'quality' || !model.qualityTier) {
      return 0;
    }
    return RouterService.QUALITY_TIER_SCORES[model.qualityTier] || 0;
  }

  /**
   * Score based on prompt analysis match
   */
  private scoreAnalysisMatch(
    model: ModelDocument,
    analysis: PromptAnalysis,
  ): number {
    let score = 0;

    // Speed indicator matching
    if (analysis.hasSpeedIndicators && model.speedTier === 'fast') {
      score += 25;
    }

    // Quality indicator matching
    if (analysis.hasQualityIndicators && model.qualityTier) {
      score += RouterService.QUALITY_INDICATOR_SCORES[model.qualityTier] || 0;
    }

    // Style matching
    if (analysis.hasSpecificStyle && model.capabilities) {
      for (const capability of model.capabilities) {
        score += RouterService.STYLE_CAPABILITY_SCORES[capability] || 0;
      }
    }

    return score;
  }

  /**
   * Score based on keyword matching
   */
  private scoreKeywordMatch(
    model: ModelDocument,
    analysis: PromptAnalysis,
  ): number {
    const recommendedFor = model.recommendedFor || [];
    let score = 0;

    // Features match (10 points each)
    for (const feature of analysis.detectedFeatures) {
      if (recommendedFor.includes(feature)) {
        score += 10;
      }
    }

    // Keywords match (5 points each)
    for (const keyword of analysis.keywords) {
      if (recommendedFor.includes(keyword)) {
        score += 5;
      }
    }

    return score;
  }

  /**
   * Score based on dimension requirements
   */
  private scoreDimensions(
    model: ModelDocument,
    options: ModelSelectionOptions,
  ): number {
    if (!options.dimensions?.width || !model.maxDimensions) {
      return 0;
    }

    let score = 0;
    const requestedWidth = options.dimensions.width;
    const maxWidth = model.maxDimensions.width;

    // Basic dimension compatibility
    if (requestedWidth <= maxWidth) {
      score += 5;
    } else {
      score -= 20; // Penalize if model can't handle requested dimensions
    }

    // Large dimension bonus
    if (requestedWidth > 2000 && maxWidth >= 4096) {
      score += 15;
    }

    return score;
  }

  /**
   * Score based on feature requirements
   */
  private scoreFeatures(
    model: ModelDocument,
    options: ModelSelectionOptions,
  ): number {
    let score = 0;
    const supports = model.supportsFeatures || [];

    // Speech requirement (critical)
    if (options.speech) {
      score += supports.includes('speech') ? 100 : -1000;
    }

    // Duration matching for video
    if (options.duration) {
      if (options.duration > 30 && supports.includes('long-duration')) {
        score += 20;
      }
      if (options.duration < 15 && supports.includes('short-duration')) {
        score += 15;
      }
    }

    return score;
  }

  /**
   * Score based on prompt complexity
   */
  private scoreComplexity(
    model: ModelDocument,
    analysis: PromptAnalysis,
  ): number {
    if (analysis.complexity === 'complex') {
      if (model.qualityTier === 'ultra' || model.qualityTier === 'high') {
        return 10;
      }
    }
    if (analysis.complexity === 'simple') {
      if (model.speedTier === 'fast') {
        return 10;
      }
    }
    return 0;
  }

  /**
   * Score based on model flags
   */
  private scoreModelFlags(model: ModelDocument): number {
    let score = 0;
    if (model.isDefault) {
      score += 5;
    }
    if (model.isHighlighted) {
      score += 3;
    }
    return score;
  }

  /**
   * Analyze prompt to understand requirements
   */
  private analyzePrompt(prompt: string): PromptAnalysis {
    const lowerPrompt = prompt.toLowerCase();

    // Quality indicators
    const hasQualityIndicators =
      /professional|high quality|detailed|intricate|complex|photorealistic|ultra|4k|hd/.test(
        lowerPrompt,
      );

    // Speed indicators
    const hasSpeedIndicators = /quick|fast|simple|draft|rapid|immediate/.test(
      lowerPrompt,
    );

    // Style indicators
    const hasSpecificStyle =
      /anime|cartoon|oil painting|watercolor|sketch|artistic|stylized|illustration/.test(
        lowerPrompt,
      );

    // Detect features
    const detectedFeatures: string[] = [];
    if (/cinematic|movie|film/.test(lowerPrompt)) {
      detectedFeatures.push('cinematic');
    }
    if (/photo|photograph|realistic/.test(lowerPrompt)) {
      detectedFeatures.push('photorealistic');
    }
    if (/landscape|nature|outdoor/.test(lowerPrompt)) {
      detectedFeatures.push('landscape');
    }
    if (/portrait|person|face/.test(lowerPrompt)) {
      detectedFeatures.push('portrait');
    }
    if (/artistic|creative|abstract/.test(lowerPrompt)) {
      detectedFeatures.push('artistic');
    }

    // Complexity assessment
    let complexity: 'simple' | 'medium' | 'complex' = 'medium';
    if (prompt.length < 50 && !hasQualityIndicators) {
      complexity = 'simple';
    } else if (
      prompt.length > 200 ||
      hasQualityIndicators ||
      detectedFeatures.length > 3
    ) {
      complexity = 'complex';
    }

    return {
      complexity,
      detectedFeatures,
      estimatedLength: prompt.length,
      hasQualityIndicators,
      hasSpecificStyle,
      hasSpeedIndicators,
      keywords: lowerPrompt.split(/\s+/).filter((w) => w.length > 3),
    };
  }

  /**
   * Select the best model from a list using scoring
   * Returns the model with the highest score
   */
  private selectBestModel(
    models: ModelDocument[],
    options: ModelSelectionOptions,
    analysis: PromptAnalysis,
  ): ModelDocument | null {
    if (models.length === 0) {
      return null;
    }

    // Score all models
    const scoredModels = models.map((model) => ({
      model,
      score: this.scoreModel(model, analysis, options),
    }));

    scoredModels.sort((a, b) => b.score - a.score);

    this.logger.debug('Model scoring results', {
      category: options.category,
      prioritize: options.prioritize,
      topModels: scoredModels.slice(0, 5).map((m) => ({
        costTier: m.model.costTier,
        key: m.model.key,
        qualityTier: m.model.qualityTier,
        score: m.score,
        speedTier: m.model.speedTier,
      })),
    });

    return scoredModels[0].model;
  }

  /**
   * Get alternative model recommendations from the models array
   */
  private getAlternativesFromModels(
    selectedModelKey: string,
    models: ModelDocument[],
    options: ModelSelectionOptions,
    analysis: PromptAnalysis,
  ): Array<{ model: string; reason: string; score: number }> {
    const otherModels = models.filter((m) => m.key !== selectedModelKey);

    // Score remaining models
    const scoredModels = otherModels.map((model) => {
      const score = this.scoreModel(model, analysis, options);
      const reasons: string[] = [];

      if (model.speedTier === 'fast') {
        reasons.push('faster generation');
      }
      if (model.costTier === 'low') {
        reasons.push('lower cost');
      }
      if (model.qualityTier === 'ultra' || model.qualityTier === 'high') {
        reasons.push('high quality');
      }
      if (model.capabilities?.includes('stylized')) {
        reasons.push('stylized output');
      }

      return {
        model: model.key,
        reason: reasons.join(', ') || 'alternative option',
        score,
      };
    });

    return scoredModels.sort((a, b) => b.score - a.score).slice(0, 2);
  }

  /**
   * Main method to select optimal model
   */
  async selectModel(
    options: ModelSelectionOptions,
  ): Promise<ModelRecommendation> {
    const url = `${RouterService.name} selectModel`;

    try {
      this.logger.debug(`${url} started`, {
        category: options.category,
        prioritize: options.prioritize,
        promptLength: options.prompt.length,
      });

      // Analyze prompt
      const analysis = this.analyzePrompt(options.prompt);

      const models = await this.getModelsByCategory(options.category);

      if (models.length === 0) {
        this.logger.warn(`${url} no models found for category`, {
          category: options.category,
        });
        // Fallback to default model
        const defaultKey = await this.getDefaultModel(options.category);
        const defaultModel = await this.modelsService.findOne({
          isDeleted: false,
          key: defaultKey,
        });

        if (!defaultModel) {
          throw new NotFoundException(
            `No models available for category ${options.category}`,
          );
        }

        return {
          alternatives: [],
          analysis,
          modelDetails: {
            category: defaultModel.category,
            cost: defaultModel.cost,
            id: String(defaultModel._id),
            key: defaultModel.key,
            provider: defaultModel.provider,
          },
          reason: 'Default model (no other models available)',
          selectedModel: defaultKey,
        };
      }

      // Select the best model using scoring
      const selectedModel = this.selectBestModel(models, options, analysis);

      if (!selectedModel) {
        throw new NotFoundException(
          `Could not select model for category ${options.category}`,
        );
      }

      // Generate reason based on the selected model
      const reason = this.generateReason(analysis, selectedModel, options);

      // Get alternatives from the same models list
      const alternatives = this.getAlternativesFromModels(
        selectedModel.key,
        models,
        options,
        analysis,
      );

      const recommendation: ModelRecommendation = {
        alternatives,
        analysis,
        modelDetails: {
          category: selectedModel.category,
          cost: selectedModel.cost,
          id: String(selectedModel._id),
          key: selectedModel.key,
          provider: selectedModel.provider,
        },
        reason,
        selectedModel: selectedModel.key,
      };

      this.logger.log(`${url} completed`, {
        category: options.category,
        complexity: analysis.complexity,
        modelsEvaluated: models.length,
        selectedModel: selectedModel.key,
      });

      return recommendation;
    } catch (error: unknown) {
      this.logger.error(`${url} error`, {
        context: {
          category: options.category,
          promptLength: options.prompt.length,
        },
        error,
      });
      throw error;
    }
  }

  /**
   * Generate human-readable reason for selection
   */
  private generateReason(
    analysis: PromptAnalysis,
    model: ModelDocument,
    options: ModelSelectionOptions,
  ): string {
    const reasons: string[] = [];

    // Priority-based reason
    if (options.prioritize === 'quality') {
      reasons.push('Optimized for quality');
    } else if (options.prioritize === 'speed') {
      reasons.push('Optimized for speed');
    } else if (options.prioritize === 'cost') {
      reasons.push('Optimized for cost');
    }

    // Analysis-based reasons
    if (analysis.hasQualityIndicators) {
      reasons.push('high-quality prompt detected');
    }

    if (analysis.complexity === 'complex') {
      reasons.push('complex scene description');
    }

    if (analysis.detectedFeatures.length > 0) {
      reasons.push(
        `supports ${analysis.detectedFeatures.slice(0, 2).join(', ')}`,
      );
    }

    // Model capability reasons
    if (model.speedTier === 'fast') {
      reasons.push('fast generation');
    }

    if (model.qualityTier === 'ultra') {
      reasons.push('ultra quality output');
    }

    if (options.speech && model.supportsFeatures?.includes('speech')) {
      reasons.push('speech support');
    }

    return reasons.join(', ') || 'balanced performance and quality';
  }

  /**
   * Get default model for category from database
   */
  public async getDefaultModel(category: ModelCategory): Promise<string> {
    // Try to get the default model from database
    const defaultModel = await this.modelsService.findOne({
      category,
      isDefault: true,
      isDeleted: false,
    });

    if (defaultModel) {
      return defaultModel.key;
    }

    // Fallback to hardcoded defaults if no database default is set
    const fallbacks: Record<ModelCategory, string> = {
      [ModelCategory.IMAGE]: DEFAULT_IMAGE_MODEL,
      [ModelCategory.VIDEO]: DEFAULT_VIDEO_MODEL,
      [ModelCategory.TEXT]: DEFAULT_TEXT_MODEL,
      [ModelCategory.IMAGE_EDIT]: ModelKey.REPLICATE_LUMA_REFRAME_IMAGE,
      [ModelCategory.IMAGE_UPSCALE]: ModelKey.REPLICATE_TOPAZ_IMAGE_UPSCALE,
      [ModelCategory.VIDEO_EDIT]: ModelKey.REPLICATE_LUMA_REFRAME_VIDEO,
      [ModelCategory.VIDEO_UPSCALE]: ModelKey.REPLICATE_TOPAZ_VIDEO_UPSCALE,
      [ModelCategory.MUSIC]: ModelKey.REPLICATE_META_MUSICGEN,
      [ModelCategory.VOICE]: 'elevenlabs',
      [ModelCategory.EMBEDDING]: ModelKey.REPLICATE_OPENAI_GPT_5_2,
    };

    this.logger.warn(
      `No default model found in database for category ${category}, using fallback`,
    );

    return fallbacks[category] || DEFAULT_TEXT_MODEL;
  }
}
