/**
 * Publish Node
 *
 * OUTPUT category node that publishes content to social platforms.
 * Requires brand input connection for credentials.
 * Creates Post entities that are trackable in the Publishing app.
 */

import type { BaseNodeData } from '../types';

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
 * - schedule (any): Optional schedule override or best-posting-time slots
 *
 * Creates Post entities in the database.
 */
export interface PublishNodeData extends BaseNodeData {
  type: 'publish';

  // Input references (populated by edges)
  inputBrandId: string | null;
  inputMediaId: string | null;
  inputCaption: string | null;
  inputSchedule: string | null;

  // Platform configuration — enabled platform ids, matching the canonical
  // `publish` action contract and every authored graph.
  platforms: string[];

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
  inputSchedule: null,
  label: 'Publish',
  platforms: [],
  publishedUrls: [],
  schedule: {
    type: 'immediate',
  },
  status: 'idle',
  type: 'publish',
};
