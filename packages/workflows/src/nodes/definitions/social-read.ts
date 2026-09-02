/**
 * Social Read Node
 *
 * On-demand input that fetches recent posts, mentions, or search results
 * from a connected social account (X first). Used mid-workflow for
 * read → analyze → report automations (#2664).
 */

import type { BaseNodeData } from '../types';

export type SocialReadMode = 'timeline' | 'mentions' | 'search';
export type SocialReadPlatform = 'twitter';

export interface SocialReadNodeData extends BaseNodeData {
  type: 'socialRead';
  /** Platform to read from (X only in v1) */
  platform: SocialReadPlatform;
  /** What to fetch */
  mode: SocialReadMode;
  /** Search query when mode is search */
  query: string;
  /** Optional username for timeline mode (defaults to connected account) */
  username: string;
  /**
   * Which connected account to read as. A brand may hold several accounts on
   * one platform; empty reads as the brand's default account.
   */
  credentialId: string;
  /** Max posts to return */
  limit: number;
  /** Output: structured posts JSON string */
  posts: string | null;
  /** Output: human-readable summary for LLM nodes */
  summary: string | null;
  /** Output: count of posts returned */
  count: number | null;
}

export const DEFAULT_SOCIAL_READ_DATA: Partial<SocialReadNodeData> = {
  count: null,
  credentialId: '',
  label: 'Read posts',
  limit: 20,
  mode: 'timeline',
  platform: 'twitter',
  posts: null,
  query: '',
  status: 'idle',
  summary: null,
  type: 'socialRead',
  username: '',
};
