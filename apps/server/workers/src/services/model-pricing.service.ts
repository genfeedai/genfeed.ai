import type { ModelDocument } from '@api/collections/models/schemas/model.schema';
import { ModelCategory, PricingType } from '@genfeedai/enums';
import { applyMargin } from '@genfeedai/helpers';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import type { IModelPricingEstimate } from '@workers/interfaces/model-discovery.interface';

/**
 * Category tier mapping for base cost estimation (in credits).
 * Tiers: basic, standard, high per category.
 */
interface ICategoryTierConfig {
  basic: number;
  standard: number;
  high: number;
  defaultPricingType: PricingType;
  defaultCostPerUnit: number;
  defaultMinCost: number;
}

const CATEGORY_TIER_MAP: Record<string, ICategoryTierConfig> = {
  [ModelCategory.IMAGE]: {
    basic: 10,
    defaultCostPerUnit: 5,
    defaultMinCost: 5,
    defaultPricingType: PricingType.PER_MEGAPIXEL,
    high: 50,
    standard: 25,
  },
  [ModelCategory.IMAGE_EDIT]: {
    basic: 15,
    defaultCostPerUnit: 8,
    defaultMinCost: 10,
    defaultPricingType: PricingType.FLAT,
    high: 60,
    standard: 30,
  },
  [ModelCategory.IMAGE_UPSCALE]: {
    basic: 10,
    defaultCostPerUnit: 3,
    defaultMinCost: 5,
    defaultPricingType: PricingType.PER_MEGAPIXEL,
    high: 40,
    standard: 20,
  },
  [ModelCategory.MUSIC]: {
    basic: 15,
    defaultCostPerUnit: 10,
    defaultMinCost: 10,
    defaultPricingType: PricingType.PER_SECOND,
    high: 40,
    standard: 20,
  },
  [ModelCategory.TEXT]: {
    basic: 2,
    defaultCostPerUnit: 0,
    defaultMinCost: 2,
    defaultPricingType: PricingType.FLAT,
    high: 15,
    standard: 5,
  },
  [ModelCategory.VIDEO]: {
    basic: 50,
    defaultCostPerUnit: 80,
    defaultMinCost: 50,
    defaultPricingType: PricingType.PER_SECOND,
    high: 200,
    standard: 100,
  },
  [ModelCategory.VIDEO_EDIT]: {
    basic: 40,
    defaultCostPerUnit: 60,
    defaultMinCost: 30,
    defaultPricingType: PricingType.FLAT,
    high: 150,
    standard: 80,
  },
  [ModelCategory.VIDEO_UPSCALE]: {
    basic: 30,
    defaultCostPerUnit: 40,
    defaultMinCost: 20,
    defaultPricingType: PricingType.PER_SECOND,
    high: 120,
    standard: 60,
  },
  [ModelCategory.VOICE]: {
    basic: 5,
    defaultCostPerUnit: 5,
    defaultMinCost: 5,
    defaultPricingType: PricingType.PER_SECOND,
    high: 25,
    standard: 10,
  },
};

/** Default fallback config for unknown categories */
const DEFAULT_TIER_CONFIG: ICategoryTierConfig = {
  basic: 10,
  defaultCostPerUnit: 0,
  defaultMinCost: 5,
  defaultPricingType: PricingType.FLAT,
  high: 50,
  standard: 25,
};

/** Minimum cost floor for all models */
const ABSOLUTE_MIN_COST = 2;

/**
 * Known per-run USD costs for Replicate models from verified owners.
 * Sourced from Replicate's published pricing pages.
 * Used for margin-based pricing when available.
 */
const REPLICATE_KNOWN_COSTS: Record<string, number> = {
  'black-forest-labs/flux-1.1-pro': 0.04,
  'black-forest-labs/flux-2-pro': 0.05,
  'black-forest-labs/flux-dev': 0.025,
  'black-forest-labs/flux-schnell': 0.003,
  'google/imagen-3': 0.04,
  'google/imagen-3-fast': 0.02,
  'google/imagen-4': 0.04,
  'google/imagen-4-fast': 0.02,
  'google/imagen-4-ultra': 0.08,
  'google/veo-3': 0.5,
  'google/veo-3-fast': 0.25,
  'ideogram-ai/ideogram-v3': 0.08,
  'ideogram-ai/ideogram-v3-turbo': 0.04,
  'luma/ray-2': 0.4,
  'luma/ray-2-flash': 0.2,
  'meta/llama-3': 0.0005,
  'openai/sora-2': 0.21,
  'runwayml/gen-4-turbo': 0.25,
};

@Injectable()
export class ModelPricingService {
  constructor(private readonly logger: LoggerService) {}

  /**
   * Estimate cost for a new model based on its category, creator,
   * and pricing patterns from existing models in the same category.
   *
   * Strategy:
   * 1. Try to match closest existing model by same category + creator
   * 2. Fall back to category-wide average from existing models
   * 3. Fall back to category tier mapping (medium tier)
   */
  estimateCost(
    category: string,
    creator: string,
    existingModels: ModelDocument[],
  ): IModelPricingEstimate {
    const context = 'ModelPricingService estimateCost';
    const tierConfig = CATEGORY_TIER_MAP[category] || DEFAULT_TIER_CONFIG;

    // Step 1: Try to match existing model by same creator + category
    const sameCreatorModels = existingModels.filter(
      (m) =>
        m.key.startsWith(`${creator}/`) &&
        m.category === category &&
        !m.isDeleted,
    );

    if (sameCreatorModels.length > 0) {
      const referenceModel = sameCreatorModels[0];

      this.logger.log(
        `${context} matched existing model from same creator: ${referenceModel.key}`,
        {
          category,
          creator,
          referenceCost: referenceModel.cost,
        },
      );

      return {
        cost: referenceModel.cost,
        costPerUnit:
          referenceModel.costPerUnit ?? tierConfig.defaultCostPerUnit,
        minCost: Math.max(
          referenceModel.minCost ?? tierConfig.defaultMinCost,
          ABSOLUTE_MIN_COST,
        ),
        pricingType:
          referenceModel.pricingType ?? tierConfig.defaultPricingType,
      };
    }

    // Step 2: Try category-wide average from existing models
    const sameCategoryModels = existingModels.filter(
      (m) => m.category === category && !m.isDeleted && m.cost > 0,
    );

    if (sameCategoryModels.length > 0) {
      const avgCost = Math.round(
        sameCategoryModels.reduce((sum, m) => sum + m.cost, 0) /
          sameCategoryModels.length,
      );

      this.logger.log(
        `${context} using category average from ${sameCategoryModels.length} existing models`,
        {
          avgCost,
          category,
          creator,
        },
      );

      return {
        cost: avgCost,
        costPerUnit: tierConfig.defaultCostPerUnit,
        minCost: Math.max(tierConfig.defaultMinCost, ABSOLUTE_MIN_COST),
        pricingType: tierConfig.defaultPricingType,
      };
    }

    // Step 3: Fall back to medium tier default
    this.logger.log(
      `${context} no existing models found, using medium tier default`,
      {
        category,
        creator,
        defaultCost: tierConfig.standard,
      },
    );

    return {
      cost: tierConfig.standard,
      costPerUnit: tierConfig.defaultCostPerUnit,
      minCost: Math.max(tierConfig.defaultMinCost, ABSOLUTE_MIN_COST),
      pricingType: tierConfig.defaultPricingType,
    };
  }

  /**
   * Estimate cost from a known provider cost in USD using the 70% margin formula.
   * Sell Price = providerCostUsd / 0.30, converted to credits.
   */
  estimateFromProviderCost(
    providerCostUsd: number,
    category: string,
  ): IModelPricingEstimate {
    const context = 'ModelPricingService estimateFromProviderCost';
    const tierConfig = CATEGORY_TIER_MAP[category] || DEFAULT_TIER_CONFIG;
    const credits = applyMargin(providerCostUsd);

    this.logger.log(`${context} applied 70% margin`, {
      category,
      credits,
      providerCostUsd,
    });

    return {
      cost: credits,
      costPerUnit: tierConfig.defaultCostPerUnit,
      minCost: Math.max(tierConfig.defaultMinCost, ABSOLUTE_MIN_COST),
      pricingType: tierConfig.defaultPricingType,
    };
  }

  /**
   * Look up a known provider cost for a Replicate model key.
   * Returns the USD cost per run, or null if unknown.
   */
  getKnownReplicateCost(modelKey: string): number | null {
    return REPLICATE_KNOWN_COSTS[modelKey] ?? null;
  }
}
