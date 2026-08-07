import { type ModelDocument } from '@api/collections/models/schemas/model.schema';
import { ModelsService } from '@api/collections/models/services/models.service';
import { DEFAULT_TEXT_MODEL } from '@api/constants/default-text-model.constant';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import type {
  ModelRecommendation,
  ModelResolution,
  ModelResolutionRequest,
  ModelSelectionOptions,
  PromptAnalysis,
} from '@api/services/router/interfaces/router.interfaces';
import {
  DEFAULT_CONTEXT_EMBEDDING_MODEL,
  MODEL_KEYS,
} from '@genfeedai/constants';
import { ModelCategory } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

const DEFAULT_IMAGE_MODEL = MODEL_KEYS.REPLICATE_GOOGLE_NANO_BANANA;
const DEFAULT_VIDEO_MODEL = MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_1;

/**
 * Last-resort keys for a registry that holds nothing usable in a category.
 *
 * This is a safety net for a broken or unseeded install, not a second
 * catalogue: nothing reads it until `resolveModelKey` has failed to find an
 * active, non-legacy registry row, and reaching it is logged at error level so
 * the install gets fixed rather than silently running on constants (#2422).
 */
const FALLBACK_MODEL_KEYS: Record<ModelCategory, string> = {
  [ModelCategory.EMBEDDING]: DEFAULT_CONTEXT_EMBEDDING_MODEL,
  [ModelCategory.IMAGE]: DEFAULT_IMAGE_MODEL,
  [ModelCategory.IMAGE_EDIT]: MODEL_KEYS.REPLICATE_LUMA_REFRAME_IMAGE,
  [ModelCategory.IMAGE_UPSCALE]: MODEL_KEYS.REPLICATE_TOPAZ_IMAGE_UPSCALE,
  [ModelCategory.MUSIC]: MODEL_KEYS.REPLICATE_META_MUSICGEN,
  [ModelCategory.TEXT]: DEFAULT_TEXT_MODEL,
  [ModelCategory.VIDEO]: DEFAULT_VIDEO_MODEL,
  [ModelCategory.VIDEO_EDIT]: MODEL_KEYS.REPLICATE_LUMA_REFRAME_VIDEO,
  [ModelCategory.VIDEO_UPSCALE]: MODEL_KEYS.REPLICATE_TOPAZ_VIDEO_UPSCALE,
  [ModelCategory.VOICE]: 'elevenlabs',
};

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

  /**
   * Ranking weights used when a category has no `isDefault` row — the registry
   * still has to yield one deterministic answer.
   */
  private static readonly QUALITY_TIER_RANKS: Record<string, number> = {
    basic: 1,
    high: 3,
    standard: 2,
    ultra: 4,
  };

  /** Cheaper wins the tiebreak between two models of equal quality. */
  private static readonly COST_TIER_RANKS: Record<string, number> = {
    high: 1,
    low: 3,
    medium: 2,
  };

  constructor(
    private readonly logger: LoggerService,
    private readonly modelsService: ModelsService,
  ) {}

  private readString(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }

  private requireString(value: unknown, field: string): string {
    const stringValue = this.readString(value);
    if (!stringValue) {
      throw new NotFoundException(`Model ${field} is missing`);
    }

    return stringValue;
  }

  private normalizeModelCategory(
    value: unknown,
    fallback: ModelCategory,
  ): ModelCategory {
    return (
      Object.values(ModelCategory).find((category) => category === value) ??
      fallback
    );
  }

  /**
   * The registry rows this router is allowed to pick from, for one category.
   *
   * A row is usable when it is active, not soft-deleted, and not legacy —
   * retired keys keep their row so historical generations still resolve, but
   * must never be routed to again. Discovery drafts are excluded by the same
   * `isActive` gate that keeps them out of the public catalog.
   *
   * Org-private rows (customer trainings, BYO models) are only eligible for
   * their owner. Entitlement is still enforced downstream by
   * `ModelRegistrationService.validateModelForOrg`; this is a visibility
   * filter, not the authorization check.
   */
  private async getUsableModels(
    category: ModelCategory,
    organizationId?: string,
  ): Promise<ModelDocument[]> {
    const models = await this.modelsService.findAllActive({
      category,
      isLegacy: false,
    });

    return models.filter(
      (model) =>
        !model.organizationId || model.organizationId === organizationId,
    );
  }

  /**
   * Rank a registry row when the category has no explicit default. Highlighted
   * rows outrank everything, then quality tier, then the cheaper option.
   */
  private rankModel(model: ModelDocument): number {
    const quality =
      RouterService.QUALITY_TIER_RANKS[String(model.qualityTier ?? '')] ?? 0;
    const cost =
      RouterService.COST_TIER_RANKS[String(model.costTier ?? '')] ?? 0;

    return (model.isHighlighted ? 100 : 0) + quality * 10 + cost;
  }

  /**
   * Highest-ranked usable row, or null when there is none. Ties break on key so
   * two pods reading the same registry always resolve to the same model.
   */
  private getHighestRankedModel(models: ModelDocument[]): ModelDocument | null {
    const ranked = models
      .filter((model) => this.readString(model.key))
      .sort((a, b) => {
        const delta = this.rankModel(b) - this.rankModel(a);
        return delta !== 0 ? delta : String(a.key).localeCompare(String(b.key));
      });

    return ranked[0] ?? null;
  }

  /**
   * First candidate key the registry actually carries as a usable row.
   * A stale brand or organization default simply falls through.
   */
  private findUsableCandidate(
    candidates: Array<string | null | undefined> | undefined,
    models: ModelDocument[],
  ): string | undefined {
    for (const candidate of candidates ?? []) {
      const key = this.readString(candidate);
      if (key && models.some((model) => model.key === key)) {
        return key;
      }
    }

    return undefined;
  }

  /**
   * The single policy for turning a category into a model key (#2422 Phase C).
   *
   * Precedence: caller candidates (explicit > brand > organization), then the
   * registry's `isDefault` row, then the highest-ranked usable row, then the
   * last-resort constant. Every step reads the registry — the constant is only
   * reached when the registry has nothing usable, and that is an error-level
   * event, not a routine fallback.
   */
  public async resolveModelKey(
    request: ModelResolutionRequest,
  ): Promise<ModelResolution> {
    const models = await this.getUsableModels(
      request.category,
      request.organizationId,
    );

    const candidate = this.findUsableCandidate(request.candidates, models);
    if (candidate) {
      return { key: candidate, source: 'candidate' };
    }

    const registryDefault = models.find(
      (model) => model.isDefault && this.readString(model.key),
    );
    if (registryDefault) {
      return { key: String(registryDefault.key), source: 'registry-default' };
    }

    const highestRanked = this.getHighestRankedModel(models);
    if (highestRanked) {
      return { key: String(highestRanked.key), source: 'registry-best' };
    }

    const fallback =
      FALLBACK_MODEL_KEYS[request.category] ?? DEFAULT_TEXT_MODEL;

    this.logger.error(`${RouterService.name} resolveModelKey empty registry`, {
      category: request.category,
      fallback,
    });

    return { key: fallback, source: 'fallback-constant' };
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
    const scoredModels = otherModels.flatMap((model) => {
      const modelKey = this.readString(model.key);
      if (!modelKey) {
        return [];
      }

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

      return [
        {
          model: modelKey,
          reason: reasons.join(', ') || 'alternative option',
          score,
        },
      ];
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

      const models = await this.getUsableModels(
        options.category,
        options.organizationId,
      );

      if (models.length === 0) {
        this.logger.warn(`${url} no models found for category`, {
          category: options.category,
        });
        // Fallback to default model
        const defaultKey = await this.getDefaultModel(options.category);
        const defaultModel = await this.modelsService.findOne({
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
            category: this.normalizeModelCategory(
              defaultModel.category,
              options.category,
            ),
            cost: defaultModel.cost,
            id: String(defaultModel.id),
            key: this.requireString(defaultModel.key, 'key'),
            provider: this.requireString(defaultModel.provider, 'provider'),
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
      const selectedModelKey = this.requireString(selectedModel.key, 'key');

      // Get alternatives from the same models list
      const alternatives = this.getAlternativesFromModels(
        selectedModelKey,
        models,
        options,
        analysis,
      );

      const recommendation: ModelRecommendation = {
        alternatives,
        analysis,
        modelDetails: {
          category: this.normalizeModelCategory(
            selectedModel.category,
            options.category,
          ),
          cost: selectedModel.cost,
          id: String(selectedModel.id),
          key: selectedModelKey,
          provider: this.requireString(selectedModel.provider, 'provider'),
        },
        reason,
        selectedModel: selectedModelKey,
      };

      this.logger.log(`${url} completed`, {
        category: options.category,
        complexity: analysis.complexity,
        modelsEvaluated: models.length,
        selectedModel: selectedModelKey,
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
   * Default model key for a category, straight from the registry.
   *
   * Thin wrapper over `resolveModelKey` so every caller that only needs "the
   * system default" shares the same policy — including the highlighted/ranked
   * step, which the old `isDefault`-or-constant lookup skipped entirely.
   */
  public async getDefaultModel(
    category: ModelCategory,
    organizationId?: string,
  ): Promise<string> {
    const resolution = await this.resolveModelKey({ category, organizationId });

    if (
      category === ModelCategory.EMBEDDING &&
      resolution.key !== DEFAULT_CONTEXT_EMBEDDING_MODEL
    ) {
      this.logger.warn(
        `Ignoring embedding default ${resolution.key}; context vectors require ${DEFAULT_CONTEXT_EMBEDDING_MODEL}`,
      );

      return DEFAULT_CONTEXT_EMBEDDING_MODEL;
    }

    return resolution.key;
  }
}
