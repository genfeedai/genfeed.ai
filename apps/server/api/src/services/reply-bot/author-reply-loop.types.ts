/**
 * Replies surface types (comments on your posts).
 * Not reply-guy / mention farming.
 */

import type {
  ReplyIntent,
  ReplyIntentSource,
} from '@genfeedai/contracts/interfaces';

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
  /** Present only when a decision answered; 0..1 (#4866). */
  intentConfidence?: number;
  intentLabel: string;
  intentSource: ReplyIntentSource;
  /** Neither auto-replied nor auto-skipped — a person decides (#4866). */
  isIntentNeedsReview: boolean;
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
