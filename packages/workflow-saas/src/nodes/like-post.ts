/**
 * Like Post Node
 *
 * ACTION category node that likes/favorites a social media post.
 * Requires brand input for credentials resolution.
 */

import type { BaseNodeData } from '@workflow-saas/types';

export type LikePostPlatform = 'twitter' | 'instagram' | 'threads' | 'facebook';

/**
 * Like Post Node Data
 *
 * Inputs:
 * - brand (brand): Brand context (required)
 * - postId (text): The post ID to like (required)
 *
 * Outputs:
 * - success (text): Whether the like was successful
 */
export interface LikePostNodeData extends BaseNodeData {
  type: 'likePost';

  /** Platform to like on */
  platform: LikePostPlatform;
  /** Post ID to like */
  postId: string;
  /** Optional specific account ID if brand has multiple */
  accountId: string;
}

/**
 * Default data for a new Like Post node
 */
export const DEFAULT_LIKE_POST_DATA: Partial<LikePostNodeData> = {
  accountId: '',
  label: 'Like Post',
  platform: 'twitter',
  postId: '',
  status: 'idle',
  type: 'likePost',
};
