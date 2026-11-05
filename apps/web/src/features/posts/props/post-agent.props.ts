import type { IPost } from '@genfeedai/contracts/interfaces';

export interface UsePostAgentOptions {
  post: IPost | null | undefined;
  /** Current HTML of the post body, as the editor holds it. */
  descriptionDraft: string;
  labelDraft: string;
  /**
   * Hand the agent this post: its own conversation, the post as context and
   * suggestions about it. Off where the page is about something else.
   */
  isEnabled: boolean;
  /** Replace the post body with text the agent wrote (HTML). */
  onApplyText: (html: string) => void;
}

export interface UsePostAgentResult {
  /** Opens the agent on this post's conversation; absent when none can open. */
  onAskAgent?: () => void;
}
