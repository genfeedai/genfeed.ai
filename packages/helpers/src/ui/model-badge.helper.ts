import { ModelCategory, ModelProvider } from '@genfeedai/contracts';

const MODEL_CATEGORY_BADGE_CLASSES: Record<ModelCategory, string> = {
  [ModelCategory.EMBEDDING]: 'bg-muted text-muted-foreground border-border',
  [ModelCategory.IMAGE]: 'bg-info/15 text-info border-info/30',
  [ModelCategory.IMAGE_EDIT]:
    '[background-color:color-mix(in_srgb,var(--accent-pink)_15%,transparent)] text-[var(--accent-pink)] [border-color:color-mix(in_srgb,var(--accent-pink)_30%,transparent)]',
  [ModelCategory.IMAGE_UPSCALE]:
    '[background-color:color-mix(in_srgb,var(--accent-rose)_15%,transparent)] text-[var(--accent-rose)] [border-color:color-mix(in_srgb,var(--accent-rose)_30%,transparent)]',
  [ModelCategory.MUSIC]: 'bg-warning/15 text-warning border-warning/30',
  [ModelCategory.TEXT]: 'bg-success/15 text-success border-success/30',
  [ModelCategory.VIDEO]:
    '[background-color:color-mix(in_srgb,var(--accent-violet)_15%,transparent)] text-[var(--accent-violet)] [border-color:color-mix(in_srgb,var(--accent-violet)_30%,transparent)]',
  [ModelCategory.VIDEO_EDIT]:
    '[background-color:color-mix(in_srgb,var(--accent-purple)_15%,transparent)] text-[var(--accent-purple)] [border-color:color-mix(in_srgb,var(--accent-purple)_30%,transparent)]',
  [ModelCategory.VIDEO_UPSCALE]: 'bg-primary/15 text-primary border-primary/30',
  [ModelCategory.VOICE]:
    '[background-color:color-mix(in_srgb,var(--accent-orange)_15%,transparent)] text-[var(--accent-orange)] [border-color:color-mix(in_srgb,var(--accent-orange)_30%,transparent)]',
};

const FALLBACK_BADGE_CLASS = 'bg-muted text-muted-foreground border-border';

/**
 * Branded inference-provider pills. Hex values match `MODEL_BRANDS` where the
 * provider exists in that catalog; OpenRouter is the local operator color.
 */
const MODEL_PROVIDER_BADGE_CLASSES: Record<ModelProvider, string> = {
  [ModelProvider.FAL]:
    '[background-color:color-mix(in_srgb,#06B6D4_15%,transparent)] text-[#06B6D4] [border-color:color-mix(in_srgb,#06B6D4_30%,transparent)]',
  [ModelProvider.GENFEED_AI]:
    '[background-color:color-mix(in_srgb,#3B82F6_15%,transparent)] text-[#3B82F6] [border-color:color-mix(in_srgb,#3B82F6_30%,transparent)]',
  [ModelProvider.MUREKA]:
    '[background-color:color-mix(in_srgb,#6B7280_15%,transparent)] text-[#9CA3AF] [border-color:color-mix(in_srgb,#6B7280_30%,transparent)]',
  [ModelProvider.OPENROUTER]:
    '[background-color:color-mix(in_srgb,#8B5CF6_15%,transparent)] text-[#A78BFA] [border-color:color-mix(in_srgb,#8B5CF6_30%,transparent)]',
  [ModelProvider.REPLICATE]:
    '[background-color:color-mix(in_srgb,#D97706_15%,transparent)] text-[#F59E0B] [border-color:color-mix(in_srgb,#D97706_30%,transparent)]',
};

const MODEL_PROVIDER_LABELS: Record<ModelProvider, string> = {
  [ModelProvider.FAL]: 'fal.ai',
  [ModelProvider.GENFEED_AI]: 'Genfeed',
  [ModelProvider.MUREKA]: 'Mureka',
  [ModelProvider.OPENROUTER]: 'OpenRouter',
  [ModelProvider.REPLICATE]: 'Replicate',
};

export function getModelCategoryBadgeClass(category?: string): string {
  if (category && category in MODEL_CATEGORY_BADGE_CLASSES) {
    return MODEL_CATEGORY_BADGE_CLASSES[category as ModelCategory];
  }

  return FALLBACK_BADGE_CLASS;
}

export function getModelProviderBadgeClass(provider?: string): string {
  if (provider && provider in MODEL_PROVIDER_BADGE_CLASSES) {
    return MODEL_PROVIDER_BADGE_CLASSES[provider as ModelProvider];
  }

  return FALLBACK_BADGE_CLASS;
}

export function getModelProviderLabel(provider?: string): string {
  if (provider && provider in MODEL_PROVIDER_LABELS) {
    return MODEL_PROVIDER_LABELS[provider as ModelProvider];
  }

  if (!provider) {
    return 'Unknown';
  }

  return provider.charAt(0).toUpperCase() + provider.slice(1);
}
