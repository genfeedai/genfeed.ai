export interface ModelBrandConfig {
  label: string;
  color: string;
  iconKey?:
    | 'anthropic'
    | 'bytedance'
    | 'deepseek'
    | 'flux'
    | 'google'
    | 'meta'
    | 'openai'
    | 'xai';
}

/**
 * Keyed by the slug in front of the slash in a model key, so this covers both
 * the generation catalogue (`black-forest-labs/…`) and the agent chat catalogue
 * (`anthropic/…`, `deepseek/…`, `local/…`). A prefix missing here renders as a
 * grey title-cased fallback via `getBrandConfig`.
 */
export const MODEL_BRANDS: Record<string, ModelBrandConfig> = {
  anthropic: { color: '#D97757', iconKey: 'anthropic', label: 'Anthropic' },
  argil: { color: '#7C3AED', label: 'Argil' },
  'black-forest-labs': { color: '#8B5CF6', iconKey: 'flux', label: 'BFL' },
  bytedance: { color: '#00F0FF', iconKey: 'bytedance', label: 'ByteDance' },
  deepseek: { color: '#4F46E5', iconKey: 'deepseek', label: 'DeepSeek' },
  'deepseek-ai': { color: '#4F46E5', iconKey: 'deepseek', label: 'DeepSeek' },
  'fal-ai': { color: '#06B6D4', label: 'Fal' },
  'genfeed-ai': { color: '#3B82F6', label: 'GenFeed' },
  google: { color: '#4285F4', iconKey: 'google', label: 'Google' },
  heygen: { color: '#00C2FF', label: 'HeyGen' },
  'ideogram-ai': { color: '#FF6B35', label: 'Ideogram' },
  kwaivgi: { color: '#FF2D55', label: 'Kling' },
  local: { color: '#64748B', label: 'Self-hosted' },
  luma: { color: '#7C3AED', label: 'Luma' },
  meta: { color: '#0668E1', iconKey: 'meta', label: 'Meta' },
  moonshotai: { color: '#16A34A', label: 'Moonshot' },
  openai: { color: '#10A37F', iconKey: 'openai', label: 'OpenAI' },
  prunaai: { color: '#10B981', label: 'Pruna' },
  qwen: { color: '#6366F1', label: 'Qwen' },
  replicate: { color: '#D97706', label: 'Replicate' },
  runwayml: { color: '#00D4FF', label: 'Runway' },
  topazlabs: { color: '#F59E0B', label: 'Topaz' },
  'wan-video': { color: '#EC4899', label: 'Wan' },
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

export function extractBrandFromKey(modelKey: string): string {
  const slashIndex = modelKey.indexOf('/');
  if (slashIndex > 0) {
    return modelKey.substring(0, slashIndex);
  }

  return 'unknown';
}

export function getBrandConfig(brandSlug: string): ModelBrandConfig {
  return (
    MODEL_BRANDS[brandSlug] ?? {
      color: '#6B7280',
      label: brandSlug.charAt(0).toUpperCase() + brandSlug.slice(1),
    }
  );
}
