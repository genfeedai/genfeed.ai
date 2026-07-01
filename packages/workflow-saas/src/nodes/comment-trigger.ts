/**
 * Comment Trigger Node Types
 *
 * Starts a workflow when a normalized social comment/message enters the
 * durable social inbox.
 */

import type { BaseNodeData } from '@workflow-saas/types';

export type CommentTriggerPlatform = 'instagram' | 'youtube';

export interface CommentTriggerNodeData extends BaseNodeData {
  type: 'commentTrigger';

  /** Platform to monitor */
  platform: CommentTriggerPlatform;
  /** Optional keyword filters applied by workflow configuration */
  keywords: string[];
  /** Optional keywords that suppress the trigger */
  excludeKeywords: string[];

  /** Last matched message ID (for display/deduplication) */
  lastMessageId: string | null;
  /** Last triggered timestamp (for display) */
  lastTriggeredAt: string | null;
}

export const DEFAULT_COMMENT_TRIGGER_DATA: Partial<CommentTriggerNodeData> = {
  excludeKeywords: [],
  keywords: [],
  label: 'Comment Trigger',
  lastMessageId: null,
  lastTriggeredAt: null,
  platform: 'youtube',
  status: 'idle',
  type: 'commentTrigger',
};

export const commentTriggerNodeDefinition = {
  category: 'trigger' as const,
  defaultData: DEFAULT_COMMENT_TRIGGER_DATA,
  description:
    'Start workflow when a YouTube or Instagram comment enters Messages',
  icon: 'MessageCircle',
  inputs: [],
  label: 'Comment Trigger',
  outputs: [
    { id: 'conversationId', label: 'Conversation ID', type: 'text' },
    { id: 'messageId', label: 'Message ID', type: 'text' },
    { id: 'postId', label: 'Source Post ID', type: 'text' },
    { id: 'postUrl', label: 'Source URL', type: 'text' },
    { id: 'text', label: 'Comment Text', type: 'text' },
    { id: 'authorId', label: 'Author ID', type: 'text' },
    { id: 'authorUsername', label: 'Author Username', type: 'text' },
    { id: 'brandId', label: 'Brand ID', type: 'text' },
    { id: 'credentialId', label: 'Credential ID', type: 'text' },
    { id: 'platform', label: 'Platform', type: 'text' },
  ],
  type: 'commentTrigger',
};
