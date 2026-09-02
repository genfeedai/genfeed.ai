import { type ModelDocument } from '@api/collections/models/schemas/model.schema';
import { ModelsService } from '@api/collections/models/services/models.service';
import { isModelOnAllowlist } from '@api/collections/models/utils/enabled-model.util';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import type {
  ModelRecommendation,
  ModelResolution,
  ModelResolutionRequest,
  ModelSelectionOptions,
  PromptAnalysis,
} from '@api/services/router/interfaces/router.interfaces';
import { DEFAULT_CONTEXT_EMBEDDING_MODEL } from '@genfeedai/constants';
import { ModelCategory, ModelLifecycle } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { ForbiddenException, Injectable } from '@nestjs/common';

/** Registry-backed model selection and recommendation policy. */
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
    private readonly orgSettingsService: OrganizationSettingsService,
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
   * Auto-routing only considers active, reviewed Recommended rows with known
   * non-zero pricing. Available and Legacy rows remain valid explicit choices;
   * Retired rows only resolve through a declared successor.
   *
   * Org-private rows (customer trainings, BYO models) are only eligible for
   * their owner. `selectModel` then further restricts to the org allowlist
   * (after the empty-allowlist seed) so Auto never picks a model that
   * `validateModelForOrg` will 403. Explicit keys still go through
   * `resolveModelKey` and the downstream allowlist check.
   */
  private async getUsableModels(
    category: ModelCategory,
    organizationId?: string,
  ): Promise<ModelDocument[]> {
    const models = await this.modelsService.findAllActive({
      category,
      lifecycle: ModelLifecycle.RECOMMENDED,
      ...(organizationId
        ? {
            OR: [{ organizationId: null }, { organizationId }],
          }
        : { organizationId: null }),
    });

    return models.filter(
      (model) =>
        (!model.organizationId || model.organizationId === organizationId) &&
        model.isFree !== true &&
        this.readNumericCost(model) !== null &&
        (!model.isDiscovered || model.reviewStatus === 'approved'),
    );
  }

  private async resolveExplicitCandidate(
    candidates: Array<string | null | undefined> | undefined,
    category: ModelCategory,
    organizationId?: string,
    recommendedModels: ModelDocument[] = [],
  ): Promise<string | undefined> {
    for (const candidate of candidates ?? []) {
      const key = this.readString(candidate);
      if (!key) continue;

      const seen = new Set<string>();
      let current =
        recommendedModels.find((model) => model.key === key) ??
        (await this.findVisibleModel(key, organizationId));
      while (
        current?.lifecycle === ModelLifecycle.RETIRED &&
        current.succeededBy &&
        !seen.has(String(current.key))
      ) {
        seen.add(String(current.key));
        current = await this.modelsService.findOne({
          key: current.succeededBy,
          organizationId: current.organizationId ?? null,
        });
      }

      if (
        current?.isActive &&
        current.category === category &&
        current.lifecycle !== ModelLifecycle.RETIRED
      ) {
        return String(current.key);
      }
    }
    return undefined;
  }

  private async findVisibleModel(
    key: string,
    organizationId?: string,
  ): Promise<ModelDocument | null> {
    if (organizationId) {
      const privateModel = await this.modelsService.findOne({
        key,
        organizationId,
      });
      if (privateModel) {
        return privateModel;
      }
    }
    return this.modelsService.findOne({ key, organizationId: null });
  }

  /**
   * Auto scoring stays inside the org allowlist. #3083 seeds an empty list
   * with latest-major-version IDs (quality-biased). Lowest Cost used to pick
   * from the full catalog (e.g. flux-schnell) and then 403 because that id
   * was not in the seed.
   */
  private async restrictToEnabledModels(
    models: ModelDocument[],
    organizationId?: string,
  ): Promise<ModelDocument[]> {
    if (!organizationId) {
      return models;
    }

    const orgSettings = await this.orgSettingsService.findOne({
      organizationId,
    });
    if (!orgSettings) {
      return [];
    }

    const ensured =
      await this.orgSettingsService.ensureEnabledModelIds(orgSettings);
    const rawEnabledModelIds = ensured.enabledModelIds;
    const enabledModelIds = Array.isArray(rawEnabledModelIds)
      ? rawEnabledModelIds.filter((id): id is string => typeof id === 'string')
      : [];

    if (enabledModelIds.length === 0) {
      return [];
    }

    return models.filter((model) => isModelOnAllowlist(model, enabledModelIds));
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
  /**
   * The single policy for turning a category into a model key (#2422 Phase C).
   *
   * Precedence: caller candidates (explicit > brand > organization), then the
   * registry's Recommended `isDefault` row, then the highest-ranked
   * Recommended row. Missing registry state fails closed.
   */
  public async resolveModelKey(
    request: ModelResolutionRequest,
  ): Promise<ModelResolution> {
    const models = await this.getUsableModels(
      request.category,
      request.organizationId,
    );

    const candidate = await this.resolveExplicitCandidate(
      request.candidates,
      request.category,
      request.organizationId,
      models,
    );
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

    throw new NotFoundException(
      `No Recommended models available for category ${request.category}`,
    );
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
    // Default/highlighted badges must not override Lowest Cost — those flags
    // currently mark quality-biased platform defaults (e.g. nano-banana), not
    // the cheapest row.
    if (prioritize !== 'cost') {
      score += this.scoreModelFlags(model);
    }

    return score;
  }

  private scorePriority(model: ModelDocument, prioritize: string): number {
    if (prioritize === 'speed' && model.speedTier === 'fast') {
      return 50;
    }
    if (prioritize === 'cost') {
      return this.scoreCostPriority(model);
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
   * Cost priority: prefer low tiers, then fall back to numeric provider/list
   * cost so registries with null costTier (common before re-seed) still pick
   * FLUX Schnell ($0.003) over Nano Banana ($0.039).
   */
  private scoreCostPriority(model: ModelDocument): number {
    if (model.costTier === 'low') {
      return 50;
    }
    if (model.costTier === 'medium') {
      return 25;
    }
    if (model.costTier === 'high') {
      return 5;
    }

    const unitCost = this.readNumericCost(model);
    if (unitCost === null) {
      return 0;
    }

    // Cheaper → higher. Map typical image prices ($0.001–$0.50) into ~55–10.
    // log10 keeps extremes from collapsing the rank table.
    const scaled = 55 - Math.log10(unitCost * 1000 + 1) * 18;
    return Math.max(0, Math.min(55, scaled));
  }

  private readNumericCost(model: ModelDocument): number | null {
    const candidates: unknown[] = [
      model.costPerUnit,
      model.minCost,
      model.providerCostUsd,
      model.cost,
    ];

    for (const value of candidates) {
      if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
        return value;
      }
      if (typeof value === 'string' && value.trim() !== '') {
        const parsed = Number(value);
        if (Number.isFinite(parsed) && parsed > 0) {
          return parsed;
        }
      }
    }

    return null;
  }

  private scoreQualityTier(model: ModelDocument, prioritize: string): number {
    if (prioritize === 'quality' || !model.qualityTier) {
      return 0;
    }
    return RouterService.QUALITY_TIER_SCORES[model.qualityTier] || 0;
  }

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

      const models = await this.restrictToEnabledModels(
        await this.getUsableModels(options.category, options.organizationId),
        options.organizationId,
      );

      if (models.length === 0) {
        this.logger.warn(`${url} no models found for category`, {
          category: options.category,
          organizationId: options.organizationId,
        });

        throw new ForbiddenException(
          'No Recommended models enabled for this workspace',
        );
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
    if (category === ModelCategory.EMBEDDING) {
      const recommended = await this.getUsableModels(category, organizationId);
      const configured = recommended.find((model) => model.isDefault);
      if (
        configured?.key &&
        configured.key !== DEFAULT_CONTEXT_EMBEDDING_MODEL
      ) {
        this.logger.warn(
          `Ignoring embedding default ${configured.key}; context vectors require ${DEFAULT_CONTEXT_EMBEDDING_MODEL}`,
        );
      }
      return DEFAULT_CONTEXT_EMBEDDING_MODEL;
    }

    const resolution = await this.resolveModelKey({ category, organizationId });
    return resolution.key;
  }
}
