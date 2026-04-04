/**
 * Publish Node
 *
 * OUTPUT category node that publishes content to social platforms.
 * Requires brand input connection for credentials.
 * Creates Post entities that are trackable in the Publisher app.
 */

import type { BaseNodeData } from '@workflow-saas/types';

/**
 * Supported social platforms
 */
export type PublishPlatform = 'twitter' | 'instagram' | 'tiktok' | 'linkedin';

/**
 * Platform configuration
 */
export interface PlatformConfig {
  enabled: boolean;
  accountId?: string; // Optional specific account if brand has multiple
}

/**
 * Schedule configuration
 */
export interface PublishSchedule {
  type: 'immediate' | 'scheduled';
  datetime?: string; // ISO 8601 datetime for scheduled posts
  timezone?: string; // Timezone for the scheduled time
}

/**
 * Publish Node Data
 *
 * Inputs:
 * - brand (brand): Brand context from Brand node (required)
 * - media (any): Media to publish - image, video, etc. (required)
 * - caption (text): Optional caption text
 *
 * Creates Post entities in the database.
 */
export interface PublishNodeData extends BaseNodeData {
  type: 'publish';

  // Input references (populated by edges)
  inputBrandId: string | null;
  inputMediaId: string | null;
  inputCaption: string | null;

  // Platform configuration
  platforms: {
    twitter: boolean;
    instagram: boolean;
    tiktok: boolean;
    linkedin: boolean;
  };

  // Schedule configuration
  schedule: PublishSchedule;

  // Caption configuration
  caption: string;
  hashtags: string[];

  // Output - created post IDs
  createdPostIds: string[];
  publishedUrls: string[];
}

/**
 * Default data for a new Publish node
 */
export const DEFAULT_PUBLISH_DATA: Partial<PublishNodeData> = {
  caption: '',
  createdPostIds: [],
  hashtags: [],
  inputBrandId: null,
  inputCaption: null,
  inputMediaId: null,
  label: 'Publish',
  platforms: {
    instagram: false,
    linkedin: false,
    tiktok: false,
    twitter: false,
  },
  publishedUrls: [],
  schedule: {
    type: 'immediate',
  },
  status: 'idle',
  type: 'publish',
};

/**
 * Publish node definition for registry
 */
export const publishNodeDefinition = {
  category: 'output' as const,
  defaultData: DEFAULT_PUBLISH_DATA,
  description:
    'Publish content to Twitter, Instagram, TikTok, or LinkedIn with scheduling support',
  icon: 'Share2',
  inputs: [
    { id: 'brand', label: 'Brand', required: true, type: 'brand' },
    { id: 'media', label: 'Media', required: true, type: 'any' },
    { id: 'caption', label: 'Caption', required: false, type: 'text' },
  ],
  label: 'Publish',
  outputs: [],
  type: 'publish',
};
