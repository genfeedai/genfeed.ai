import type { IPublicContentPreview } from '@genfeedai/contracts/interfaces';

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
