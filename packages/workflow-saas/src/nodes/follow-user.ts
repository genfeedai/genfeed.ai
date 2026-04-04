/**
 * Follow User Node
 *
 * ACTION category node that follows a user on a social platform.
 * Requires brand input for credentials resolution.
 */

import type { BaseNodeData } from '@workflow-saas/types';

export type FollowUserPlatform = 'twitter' | 'instagram' | 'threads';

/**
 * Follow User Node Data
 *
 * Inputs:
 * - brand (brand): Brand context (required)
 * - userId (text): The user ID to follow (required)
 *
 * Outputs:
 * - success (text): Whether the follow was successful
 */
export interface FollowUserNodeData extends BaseNodeData {
  type: 'followUser';

  /** Platform to follow on */
  platform: FollowUserPlatform;
  /** User ID to follow */
  userId: string;
  /** Optional specific account ID if brand has multiple */
  accountId: string;
}

/**
 * Default data for a new Follow User node
 */
export const DEFAULT_FOLLOW_USER_DATA: Partial<FollowUserNodeData> = {
  accountId: '',
  label: 'Follow User',
  platform: 'twitter',
  status: 'idle',
  type: 'followUser',
  userId: '',
};
