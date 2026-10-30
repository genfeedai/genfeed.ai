import type { ReplyIntent } from '@genfeedai/props/messages/replies-page.props';

export interface RepliesReplyComposerProps {
  /** Handle the reply is addressed to; names the editor for assistive tech. */
  readonly authorUsername: string;
  readonly draft: string;
  readonly intent: ReplyIntent;
  readonly isBusy: boolean;
  readonly onDraft: () => void;
  readonly onDraftChange: (value: string) => void;
  readonly onIntentChange: (intent: ReplyIntent) => void;
  readonly onSend: () => void;
}
