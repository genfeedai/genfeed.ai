import type { PostQuickActionKey } from '@genfeedai/contracts/interfaces';

export type TweetTone =
  | 'professional'
  | 'casual'
  | 'viral'
  | 'educational'
  | 'humorous';

export type PostComposerPresetKey =
  | PostQuickActionKey
  | 'hashtags'
  | 'caption'
  | 'thread'
  | 'grok'
  | 'comment';

export interface PostComposerActionsProps {
  /** What the actions apply to, shown beside a proposal (e.g. "Post 2", "Caption"). */
  targetLabel: string;
  /** Current HTML of the target post, shown as "before" beside a rewrite. */
  targetContent: string;
  /** Platform name used in preset prompts (e.g. "TikTok"). */
  platformLabel: string;
  /** True while the page is running an AI request for any post. */
  isBusy: boolean;
  /** Offer "Turn into a thread" (X parent post without replies). */
  canDraftThread?: boolean;
  /** Offer "End with @grok" (X thread without a closing @grok post). */
  canEndWithGrok?: boolean;
  /** Offer "Add first comment" (platform supports it, none added yet). */
  canAddFirstComment?: boolean;
  /**
   * Rewrite the target post. Resolves to the proposed text, or null when the
   * rewrite failed. `actionKey` is set for the built-in quick actions.
   */
  onRewrite: (
    prompt: string,
    actionKey: PostQuickActionKey | null,
    tone: TweetTone,
  ) => Promise<string | null>;
  /** Apply an accepted rewrite to the target post. */
  onApplyRewrite: (text: string) => void;
  /** Propose replies for the thread. Resolves to null when drafting failed. */
  onDraftThread?: (tone: TweetTone) => Promise<string[] | null>;
  /** Add accepted thread replies. */
  onAddThreadPosts?: (texts: string[]) => Promise<void>;
  onEndWithGrok?: () => void;
  onAddFirstComment?: () => void;
  /**
   * Open the agent on this post's own conversation, for anything the one-tap
   * actions do not cover. The button is hidden when no agent can open here.
   */
  onAskAgent?: () => void;
  className?: string;
}
