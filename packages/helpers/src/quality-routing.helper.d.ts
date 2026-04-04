import { type IngredientFormat, ModelCategory, ModelKey, QualityTier } from '@genfeedai/enums';
import type { IModel } from '@genfeedai/interfaces';
export interface QualityTierOption {
    value: QualityTier;
    label: string;
    description: string;
}
export declare const QUALITY_TIER_OPTIONS: QualityTierOption[];
export declare const DEFAULT_QUALITY_TIER = QualityTier.HIGH;
export declare const IMAGE_QUALITY_MODELS: Record<QualityTier, ModelKey[]>;
export declare const VIDEO_QUALITY_MODELS: Record<QualityTier, ModelKey[]>;
export declare const MUSIC_QUALITY_MODELS: Record<QualityTier, ModelKey[]>;
export declare const CATEGORY_QUALITY_MODELS: Partial<Record<ModelCategory, Record<QualityTier, ModelKey[]>>>;
export declare function resolveQualityToModel(quality: QualityTier, category: ModelCategory, format: IngredientFormat | string, availableModelKeys: string[]): ModelKey | null;
export declare function getQualityTierForModel(modelKey: string, category: ModelCategory): QualityTier;
export declare function getQualityTierLabel(quality: QualityTier): string;
export declare function isQualityTierSupportedForCategory(category: ModelCategory): boolean;
/**
 * Resolve quality tier to a model using model documents from the database.
 * Models are filtered by category, quality tier, format compatibility, and active status.
 * Falls back to lower tiers if the requested tier has no compatible models.
 */
export declare function resolveQualityToModelFromDb(quality: QualityTier, category: ModelCategory, format: IngredientFormat | string, models: IModel[]): IModel | null;
/**
 * Get the quality tier for a model from its DB document.
 * Falls back to DEFAULT_QUALITY_TIER if not set.
 */
export declare function getQualityTierFromModel(model: IModel): QualityTier;
//# sourceMappingURL=quality-routing.helper.d.ts.map