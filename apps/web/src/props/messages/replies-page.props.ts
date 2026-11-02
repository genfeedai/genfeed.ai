export type ReplyIntent = 'thanks' | 'question' | 'troll' | 'spam' | 'default';

export type InboxItem = {
  authorDisplayName?: string;
  authorId: string;
  authorUsername: string;
  commentId: string;
  commentText: string;
  commentUrl?: string;
  createdAt: string;
  intent: ReplyIntent;
  intentLabel: string;
  parentPostId: string;
  parentPostPreview?: string;
  parentPostUrl?: string;
  shouldSkipAuto: boolean;
};

export type DraftState = Record<string, string>;
export type IntentState = Record<string, ReplyIntent>;

/** One cached read of a brand's unreplied-comments inbox on one platform. */
export type RepliesInboxData = {
  items: InboxItem[];
  platformLabel: string;
  username?: string;
};
