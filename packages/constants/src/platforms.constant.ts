/**
 * Platform configuration constants for ChatGPT pages
 */

export interface PlatformConfig {
  color: string;
  label: string;
}

export const PLATFORM_CONFIG: Record<string, PlatformConfig> = {
  instagram: { color: 'bg-pink-500', label: 'Instagram' },
  linkedin: { color: 'bg-blue-700', label: 'LinkedIn' },
  tiktok: { color: 'bg-black', label: 'TikTok' },
  twitter: { color: 'bg-blue-400', label: 'X (Twitter)' },
  youtube: { color: 'bg-red-600', label: 'YouTube' },
};

export const PUBLISH_PLATFORMS = [
  { label: 'YouTube', platform: 'youtube' },
  { label: 'TikTok', platform: 'tiktok' },
  { label: 'Instagram', platform: 'instagram' },
  { label: 'X (Twitter)', platform: 'twitter' },
  { label: 'LinkedIn', platform: 'linkedin' },
] as const;

export const ARTICLE_PUBLISH_PLATFORMS = [
  { label: 'X (Twitter)', platform: 'twitter' },
  { label: 'LinkedIn', platform: 'linkedin' },
] as const;
