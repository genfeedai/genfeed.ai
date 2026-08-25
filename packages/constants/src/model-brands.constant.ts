export type ModelBrandIconKey =
  | 'anthropic'
  | 'argil'
  | 'bytedance'
  | 'deepseek'
  | 'fal'
  | 'flux'
  | 'genfeed'
  | 'google'
  | 'heygen'
  | 'higgsfield'
  | 'ideogram'
  | 'kling'
  | 'local'
  | 'luma'
  | 'meta'
  | 'minimax'
  | 'moonshot'
  | 'openai'
  | 'pruna'
  | 'qwen'
  | 'replicate'
  | 'runway'
  | 'topaz'
  | 'wan'
  | 'xai';

export interface ModelBrandConfig {
  label: string;
  color: string;
  iconKey?: ModelBrandIconKey;
}

/**
 * Keyed by the slug in front of the slash in a model key, so this covers both
 * the generation catalogue (`black-forest-labs/…`) and the agent chat catalogue
 * (`anthropic/…`, `deepseek/…`, `local/…`). A prefix missing here renders as a
 * grey title-cased fallback via `getBrandConfig`.
 */
export const MODEL_BRANDS: Record<string, ModelBrandConfig> = {
  anthropic: { color: '#D97757', iconKey: 'anthropic', label: 'Anthropic' },
  argil: { color: '#7C3AED', iconKey: 'argil', label: 'Argil' },
  'black-forest-labs': { color: '#8B5CF6', iconKey: 'flux', label: 'BFL' },
  bytedance: { color: '#00F0FF', iconKey: 'bytedance', label: 'ByteDance' },
  deepseek: { color: '#4F46E5', iconKey: 'deepseek', label: 'DeepSeek' },
  'deepseek-ai': { color: '#4F46E5', iconKey: 'deepseek', label: 'DeepSeek' },
  'fal-ai': { color: '#06B6D4', iconKey: 'fal', label: 'Fal' },
  'genfeed-ai': { color: '#3B82F6', iconKey: 'genfeed', label: 'GenFeed' },
  google: { color: '#4285F4', iconKey: 'google', label: 'Google' },
  heygen: { color: '#00C2FF', iconKey: 'heygen', label: 'HeyGen' },
  'higgsfield-ai': {
    color: '#EC4899',
    iconKey: 'higgsfield',
    label: 'Higgsfield',
  },
  'ideogram-ai': { color: '#FF6B35', iconKey: 'ideogram', label: 'Ideogram' },
  kwaivgi: { color: '#FF2D55', iconKey: 'kling', label: 'Kling' },
  local: { color: '#64748B', iconKey: 'local', label: 'Self-hosted' },
  luma: { color: '#7C3AED', iconKey: 'luma', label: 'Luma' },
  meta: { color: '#0668E1', iconKey: 'meta', label: 'Meta' },
  minimax: { color: '#F97316', iconKey: 'minimax', label: 'MiniMax' },
  moonshotai: { color: '#16A34A', iconKey: 'moonshot', label: 'Moonshot' },
  openai: { color: '#10A37F', iconKey: 'openai', label: 'OpenAI' },
  prunaai: { color: '#10B981', iconKey: 'pruna', label: 'Pruna' },
  qwen: { color: '#6366F1', iconKey: 'qwen', label: 'Qwen' },
  replicate: { color: '#D97706', iconKey: 'replicate', label: 'Replicate' },
  runwayml: { color: '#00D4FF', iconKey: 'runway', label: 'Runway' },
  topazlabs: { color: '#F59E0B', iconKey: 'topaz', label: 'Topaz' },
  'wan-video': { color: '#EC4899', iconKey: 'wan', label: 'Wan' },
  'x-ai': { color: '#FFFFFF', iconKey: 'xai', label: 'xAI' },
};

export const COST_TIER_DISPLAY: Record<
  string,
  { symbol: string; colorClass: string }
> = {
  high: { colorClass: 'text-orange-400 bg-orange-400/10', symbol: '$$$' },
  low: { colorClass: 'text-green-400 bg-green-400/10', symbol: '$' },
  medium: { colorClass: 'text-yellow-400 bg-yellow-400/10', symbol: '$$' },
};

/**
 * Catalog keys that have no `provider/` prefix. Map them to a real brand
 * instead of dumping every leftover into an "Unknown" bucket.
 */
const MODEL_KEY_BRAND_ALIASES: Record<string, string> = {
  'klingai-v2': 'kwaivgi',
  'kling-video/v3/pro/image-to-video': 'higgsfield-ai',
};

const FALLBACK_BRAND_LABELS: Record<string, string> = {
  leonardoai: 'Leonardo',
  sdxl: 'SDXL',
};

export function extractBrandFromKey(modelKey: string): string {
  if (MODEL_BRANDS[modelKey]) {
    return modelKey;
  }

  const aliasedBrand = MODEL_KEY_BRAND_ALIASES[modelKey];
  if (aliasedBrand) {
    return aliasedBrand;
  }

  const slashIndex = modelKey.indexOf('/');
  if (slashIndex > 0) {
    return modelKey.substring(0, slashIndex);
  }

  return modelKey;
}

export function getBrandConfig(brandSlug: string): ModelBrandConfig {
  return (
    MODEL_BRANDS[brandSlug] ?? {
      color: '#6B7280',
      label:
        FALLBACK_BRAND_LABELS[brandSlug] ??
        brandSlug.charAt(0).toUpperCase() + brandSlug.slice(1),
    }
  );
}
