/**
 * Post Reply Node
 *
 * ACTION category node that replies to a social media post.
 * Requires brand input for credentials resolution.
 */

import type { BaseNodeData } from '@workflow-saas/types';

export type PostReplyPlatform =
  | 'twitter'
  | 'instagram'
  | 'threads'
  | 'facebook';

/**
 * Post Reply Node Data
 *
 * Inputs:
 * - brand (brand): Brand context (required)
 * - postId (text): The post ID to reply to (required)
 * - text (text): Reply text (required)
 *
 * Outputs:
 * - replyId (text): The ID of the created reply
 * - replyUrl (text): URL of the created reply
 */
export interface PostReplyNodeData extends BaseNodeData {
  type: 'postReply';

  /** Platform to reply on */
  platform: PostReplyPlatform;
  /** Post ID to reply to (can come from input) */
  postId: string;
  /** Reply text (can come from input) */
  text: string;
  /** Optional media URL to attach */
  mediaUrl: string;

  /** Output - created reply ID */
  replyId: string | null;
  /** Output - created reply URL */
  replyUrl: string | null;
}

/**
 * Default data for a new Post Reply node
 */
export const DEFAULT_POST_REPLY_DATA: Partial<PostReplyNodeData> = {
  label: 'Post Reply',
  mediaUrl: '',
  platform: 'twitter',
  postId: '',
  replyId: null,
  replyUrl: null,
  status: 'idle',
  text: '',
  type: 'postReply',
};
