import type { SocialConversationAvailability } from '@genfeedai/contracts/interfaces';

export type MessagesReplyComposerAction = 'draft' | 'dm' | 'reply';

export interface MessagesReplyComposerProps {
  readonly availability: SocialConversationAvailability;
  /** The action currently running, if any (`draft`, `reply`, `dm`, `suggested-reply`, ...). */
  readonly busyAction: string | null;
  readonly draft: string;
  /** Failure from the last action; shown inside the bar. */
  readonly error?: string | null;
  /** Success note from the last action; shown inside the bar. */
  readonly notice?: string | null;
  readonly onAction: (action: MessagesReplyComposerAction) => void;
  readonly onDraftChange: (value: string) => void;
  readonly onSuggestedReply: () => void;
  readonly participantLabel: string;
}
