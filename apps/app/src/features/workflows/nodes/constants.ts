/**
 * Shared constants for workflow nodes
 * Extracted to avoid duplication across node components
 */

import type {
  CaptionGenNodeData,
  ExportPlatform,
} from '@/features/workflows/nodes/types';

/**
 * Platform options with aspect ratio information
 * Used by PlatformExportNode, PlatformMultiplierNode, CaptionGenNode
 */
export interface PlatformOption {
  value: ExportPlatform;
  label: string;
  aspectRatio: string;
  icon?: 'phone' | 'monitor' | 'square';
}

export const PLATFORM_OPTIONS: PlatformOption[] = [
  { aspectRatio: '9:16', icon: 'phone', label: 'TikTok', value: 'tiktok' },
  {
    aspectRatio: '9:16',
    icon: 'phone',
    label: 'YouTube Shorts',
    value: 'youtube_shorts',
  },
  {
    aspectRatio: '9:16',
    icon: 'phone',
    label: 'Instagram Reels',
    value: 'instagram_reels',
  },
  {
    aspectRatio: '9:16',
    icon: 'phone',
    label: 'Instagram Stories',
    value: 'instagram_stories',
  },
  {
    aspectRatio: '1:1',
    icon: 'square',
    label: 'Instagram Post',
    value: 'instagram_post',
  },
  {
    aspectRatio: '16:9',
    icon: 'monitor',
    label: 'X (Twitter)',
    value: 'twitter',
  },
  { aspectRatio: '1:1', icon: 'square', label: 'LinkedIn', value: 'linkedin' },
  {
    aspectRatio: '9:16',
    icon: 'phone',
    label: 'Facebook Reels',
    value: 'facebook_reels',
  },
  {
    aspectRatio: '16:9',
    icon: 'monitor',
    label: 'YouTube',
    value: 'youtube_standard',
  },
  { aspectRatio: 'Custom', icon: 'monitor', label: 'Custom', value: 'custom' },
];

/**
 * Get platform options filtered by aspect ratio
 */
export function getPlatformsByAspectRatio(
  aspectRatio: string,
): PlatformOption[] {
  return PLATFORM_OPTIONS.filter((p) => p.aspectRatio === aspectRatio);
}

/**
 * Get platform label by value
 */
export function getPlatformLabel(platform: ExportPlatform): string {
  return PLATFORM_OPTIONS.find((p) => p.value === platform)?.label || platform;
}

/**
 * Get platform icon type by value
 */
export function getPlatformIconType(
  platform: ExportPlatform,
): 'phone' | 'monitor' | 'square' {
  return PLATFORM_OPTIONS.find((p) => p.value === platform)?.icon || 'monitor';
}

/**
 * Tone options for caption generation
 */
export interface ToneOption {
  value: CaptionGenNodeData['tone'];
  label: string;
  description: string;
}

export const TONE_OPTIONS: ToneOption[] = [
  {
    description: 'Business-appropriate, clear, authoritative',
    label: 'Professional',
    value: 'professional',
  },
  {
    description: 'Friendly, conversational, relatable',
    label: 'Casual',
    value: 'casual',
  },
  {
    description: 'Clever, humorous, engaging',
    label: 'Witty',
    value: 'witty',
  },
  {
    description: 'Motivating, uplifting, empowering',
    label: 'Inspirational',
    value: 'inspirational',
  },
  {
    description: 'Time-sensitive, action-oriented, FOMO',
    label: 'Urgent',
    value: 'urgent',
  },
  {
    description:
      'Narrative-driven, TikTok-native storytelling ("She was about to quit her 9-5 when...")',
    label: 'Storytelling',
    value: 'storytelling',
  },
];

/**
 * CTA options for caption generation
 */
export interface CtaOption {
  value: CaptionGenNodeData['ctaType'];
  label: string;
}

export const CTA_OPTIONS: CtaOption[] = [
  { label: 'Link in bio', value: 'link_bio' },
  { label: 'Follow for more', value: 'follow' },
  { label: 'Comment below', value: 'comment' },
  { label: 'Share with friends', value: 'share' },
  { label: 'Save this', value: 'save' },
  { label: 'Custom CTA', value: 'custom' },
];

/**
 * Clip selection criteria options
 */
export interface CriteriaOption {
  value:
    | 'engagement_potential'
    | 'key_moments'
    | 'emotional_peaks'
    | 'educational_value';
  label: string;
  description: string;
}

export const CLIP_CRITERIA_OPTIONS: CriteriaOption[] = [
  {
    description: 'Clips most likely to generate likes, comments, shares',
    label: 'Engagement Potential',
    value: 'engagement_potential',
  },
  {
    description: 'Important highlights and turning points',
    label: 'Key Moments',
    value: 'key_moments',
  },
  {
    description: 'Moments with strong emotional impact',
    label: 'Emotional Peaks',
    value: 'emotional_peaks',
  },
  {
    description: 'Most informative and educational segments',
    label: 'Educational Value',
    value: 'educational_value',
  },
];

/**
 * Format time in seconds to MM:SS format
 */
export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
