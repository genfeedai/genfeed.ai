import type { BaseNodeData } from '@workflow-saas/types';

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

export const commentTriggerNodeDefinition = {
  category: 'trigger' as const,
  defaultData: DEFAULT_COMMENT_TRIGGER_DATA,
  description: 'Start workflow when a social comment is detected',
  icon: 'MessageCircle',
  inputs: [],
  label: 'Comment Trigger',
  outputs: [
    { id: 'commentId', label: 'Comment ID', type: 'text' },
    { id: 'contentId', label: 'Content ID', type: 'text' },
    { id: 'contentUrl', label: 'Content URL', type: 'text' },
    { id: 'text', label: 'Comment Text', type: 'text' },
    { id: 'authorId', label: 'Author ID', type: 'text' },
    { id: 'authorUsername', label: 'Author Username', type: 'text' },
    { id: 'platform', label: 'Platform', type: 'text' },
  ],
  type: 'commentTrigger',
};
