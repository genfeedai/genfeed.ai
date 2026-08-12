/**
 * Author-reply conversation loop (X algo: author engages reader replies).
 * Not reply-guy / mention farming.
 */

export type AuthorReplyInboxItem = {
  authorDisplayName?: string;
  authorId: string;
  authorUsername: string;
  commentId: string;
  commentText: string;
  commentUrl?: string;
  createdAt: string;
  parentPostId: string;
  parentPostPreview?: string;
  parentPostUrl?: string;
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
  platform: string;
};

export type AuthorReplyDraftResult = {
  commentId: string;
  draft: string;
  harnessApplied: boolean;
};

export type AuthorReplySendResult = {
  commentId: string;
  contentId?: string;
  contentUrl?: string;
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
