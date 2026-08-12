/**
 * Replies surface types (comments on your posts).
 * Not reply-guy / mention farming.
 */

import type { ReplyIntent } from '@api/services/reply-bot/reply-intent.util';

export type AuthorReplyInboxItem = {
  authorDisplayName?: string;
  authorId: string;
  authorUsername: string;
  commentId: string;
  commentText: string;
  commentUrl?: string;
  createdAt: string;
  /** Suggested persona from heuristics (override allowed on draft/send). */
  intent: ReplyIntent;
  intentLabel: string;
  parentPostId: string;
  parentPostPreview?: string;
  parentPostUrl?: string;
  /** Spam is listed but auto-reply should skip. */
  shouldSkipAuto: boolean;
};

export type AuthorReplyInboxResult = {
  hours: number;
  items: AuthorReplyInboxItem[];
  platform: string;
  username?: string;
};

export type EnsureAuthorResponderResult = {
  botConfigId: string;
  created: boolean;
  isActive: boolean;
  maxAgeHours: number;
  platform: string;
  /** X Activity API subscription outcome when enabling X replies. */
  xActivity?: {
    message: string;
    mode: 'live' | 'skipped';
  };
};

export type AuthorReplyDraftResult = {
  commentId: string;
  draft: string;
  harnessApplied: boolean;
  intent: ReplyIntent;
  intentLabel: string;
};

export type AuthorReplySendResult = {
  commentId: string;
  contentId?: string;
  contentUrl?: string;
  intent?: ReplyIntent;
  replyText: string;
  success: boolean;
  error?: string;
};

export type RecordAuthorClosedLoopParams = {
  brandId?: string;
  commentId: string;
  organizationId: string;
  parentPostId: string;
  platform?: string;
  replyContentId?: string;
};
