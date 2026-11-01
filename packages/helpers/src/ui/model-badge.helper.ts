import { ModelCategory, ModelProvider } from '@genfeedai/contracts';

export interface ModelBadgeColors {
  backgroundColor: string;
  textColor: string;
}

const tint = (color: string): ModelBadgeColors => ({
  backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)`,
  textColor: color,
});

const MODEL_CATEGORY_BADGE_COLORS: Record<ModelCategory, ModelBadgeColors> = {
  [ModelCategory.AVATAR]: tint('var(--color-agent)'),
  [ModelCategory.EMBEDDING]: tint('var(--color-muted-foreground)'),
  [ModelCategory.IMAGE]: tint('var(--color-info)'),
  [ModelCategory.IMAGE_EDIT]: tint('var(--accent-pink)'),
  [ModelCategory.IMAGE_UPSCALE]: tint('var(--accent-rose)'),
  [ModelCategory.MUSIC]: tint('var(--color-warning)'),
  [ModelCategory.TEXT]: tint('var(--color-success)'),
  [ModelCategory.VIDEO]: tint('var(--accent-violet)'),
  [ModelCategory.VIDEO_EDIT]: tint('var(--accent-purple)'),
  [ModelCategory.VIDEO_UPSCALE]: tint('var(--color-primary)'),
  [ModelCategory.VOICE]: tint('var(--accent-orange)'),
};

const FALLBACK_BADGE_COLORS: ModelBadgeColors = tint(
  'var(--color-muted-foreground)',
);

/**
 * Branded inference-provider pills. Hex values match `MODEL_BRANDS` where the
 * provider exists in that catalog; OpenRouter is the local operator color.
 */
const MODEL_PROVIDER_BADGE_COLORS: Record<ModelProvider, ModelBadgeColors> = {
  [ModelProvider.CRUN]: FALLBACK_BADGE_COLORS,
  [ModelProvider.ELEVENLABS]: { ...tint('#A1A1AA'), textColor: '#D4D4D8' },
  [ModelProvider.FAL]: tint('#06B6D4'),
  [ModelProvider.GENFEED_AI]: tint('#3B82F6'),
  [ModelProvider.HEYGEN]: { ...tint('#EC4899'), textColor: '#F472B6' },
  [ModelProvider.HIGGSFIELD]: { ...tint('#84CC16'), textColor: '#A3E635' },
  [ModelProvider.MUREKA]: { ...tint('#6B7280'), textColor: '#9CA3AF' },
  [ModelProvider.OPENROUTER]: { ...tint('#8B5CF6'), textColor: '#A78BFA' },
  [ModelProvider.REPLICATE]: { ...tint('#D97706'), textColor: '#F59E0B' },
  [ModelProvider.GOOGLE]: tint('#4285F4'),
  [ModelProvider.XAI]: tint('var(--color-foreground)'),
  [ModelProvider.BFL]: tint('#FB923C'),
  [ModelProvider.RUNWAY]: tint('#FACC15'),
  [ModelProvider.OPENAI]: tint('#10A37F'),
};

const MODEL_PROVIDER_LABELS: Record<ModelProvider, string> = {
  [ModelProvider.CRUN]: 'Crun',
  [ModelProvider.ELEVENLABS]: 'ElevenLabs',
  [ModelProvider.FAL]: 'fal.ai',
  [ModelProvider.GENFEED_AI]: 'Genfeed',
  [ModelProvider.HEYGEN]: 'HeyGen',
  [ModelProvider.HIGGSFIELD]: 'Higgsfield',
  [ModelProvider.MUREKA]: 'Mureka',
  [ModelProvider.OPENROUTER]: 'OpenRouter',
  [ModelProvider.REPLICATE]: 'Replicate',
  [ModelProvider.GOOGLE]: 'Google Gemini API',
  [ModelProvider.XAI]: 'xAI',
  [ModelProvider.BFL]: 'Black Forest Labs',
  [ModelProvider.RUNWAY]: 'Runway',
  [ModelProvider.OPENAI]: 'OpenAI',
};

/** Colours for `<Badge variant="custom" colors={...}>`. */
export function getModelCategoryBadgeColors(
  category?: string,
): ModelBadgeColors {
  if (category && category in MODEL_CATEGORY_BADGE_COLORS) {
    return MODEL_CATEGORY_BADGE_COLORS[category as ModelCategory];
  }

  return FALLBACK_BADGE_COLORS;
}

export function getModelProviderBadgeColors(
  provider?: string,
): ModelBadgeColors {
  if (provider && provider in MODEL_PROVIDER_BADGE_COLORS) {
    return MODEL_PROVIDER_BADGE_COLORS[provider as ModelProvider];
  }

  return FALLBACK_BADGE_COLORS;
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
