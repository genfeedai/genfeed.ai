import type { BaseNodeData } from '../types';

export type CommentTriggerPlatform =
  | 'youtube'
  | 'instagram'
  | 'twitter'
  | 'tiktok'
  | 'reddit';

export interface CommentTriggerNodeData extends BaseNodeData {
  type: 'commentTrigger';
  platform: CommentTriggerPlatform;
  brandId: string | null;
  contentIds: string[];
  keywords: string[];
  excludeKeywords: string[];
  lastCommentId: string | null;
  lastTriggeredAt: string | null;
}

export const DEFAULT_COMMENT_TRIGGER_DATA: Partial<CommentTriggerNodeData> = {
  brandId: null,
  contentIds: [],
  excludeKeywords: [],
  keywords: [],
  label: 'Comment Trigger',
  lastCommentId: null,
  lastTriggeredAt: null,
  platform: 'youtube',
  status: 'idle',
  type: 'commentTrigger',
};
