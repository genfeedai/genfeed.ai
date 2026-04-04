import type { IconType } from 'react-icons';
import {
  SiBytedance,
  SiGoogle,
  SiHuggingface,
  SiMeta,
  SiOpenai,
} from 'react-icons/si';

export interface ModelBrandConfig {
  label: string;
  color: string;
  icon?: IconType;
}

export const MODEL_BRANDS: Record<string, ModelBrandConfig> = {
  'black-forest-labs': { color: '#8B5CF6', label: 'BFL' },
  bytedance: { color: '#00F0FF', icon: SiBytedance, label: 'ByteDance' },
  'deepseek-ai': { color: '#4F46E5', label: 'DeepSeek' },
  'fal-ai': { color: '#06B6D4', label: 'Fal' },
  'genfeed-ai': { color: '#3B82F6', label: 'GenFeed' },
  google: { color: '#4285F4', icon: SiGoogle, label: 'Google' },
  heygen: { color: '#00C2FF', label: 'HeyGen' },
  hf: { color: '#FFD21E', icon: SiHuggingface, label: 'HuggingFace' },
  'ideogram-ai': { color: '#FF6B35', label: 'Ideogram' },
  kwaivgi: { color: '#FF2D55', label: 'Kling' },
  luma: { color: '#7C3AED', label: 'Luma' },
  meta: { color: '#0668E1', icon: SiMeta, label: 'Meta' },
  openai: { color: '#10A37F', icon: SiOpenai, label: 'OpenAI' },
  prunaai: { color: '#10B981', label: 'Pruna' },
  qwen: { color: '#6366F1', label: 'Qwen' },
  replicate: { color: '#D97706', label: 'Replicate' },
  runwayml: { color: '#00D4FF', label: 'Runway' },
  topazlabs: { color: '#F59E0B', label: 'Topaz' },
  'wan-video': { color: '#EC4899', label: 'Wan' },
  'x-ai': { color: '#FFFFFF', label: 'xAI' },
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
 * Extract brand slug from a model key.
 * e.g., "google/imagen-3" → "google"
 *       "fal-ai/flux/dev" → "fal-ai"
 *       "hf/stabilityai/..." → "hf"
 *       "genfeed-ai/flux-dev" → "genfeed-ai"
 */
export function extractBrandFromKey(modelKey: string): string {
  // HuggingFace prefix
  if (modelKey.startsWith('hf/')) {
    return 'hf';
  }

  // Standard prefix extraction: "org/model-name" → "org"
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
