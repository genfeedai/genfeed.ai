import type {
  IPublicContentPreview,
  IPublicContentPreviewItem,
} from '@genfeedai/contracts/interfaces';

export interface InviteProfileProps {
  /** The handle in the address; the invite answers only under its own brand's handle. */
  handle: string;
  /** The invite key from the link. It is the only credential a logged-out lead holds. */
  token: string;
}

export type InviteProfileLoadState =
  | { status: 'loading' }
  | { status: 'unavailable' }
  | { invite: IPublicContentPreview; status: 'ready' };

export type InviteUnlockStatus = 'failed' | 'idle' | 'sending' | 'sent';

export interface LockedPostListProps {
  /** Shown when the invite carries no posts. */
  emptyMessage: string;
  /** The prepared posts, in the order the invite lists them. */
  items: IPublicContentPreviewItem[];
}
