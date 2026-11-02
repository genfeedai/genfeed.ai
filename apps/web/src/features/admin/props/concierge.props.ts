import type {
  IWarmupAccount,
  IWarmupAccountCreateRequest,
  IWarmupAccountStatus,
} from '@genfeedai/contracts/interfaces';

export type ConciergeInvitationAction =
  | 'inspect'
  | 'resend'
  | 'revoke'
  | 'send';

/** What the Context sidebar needs to load one organization's concierge account. */
export interface ConciergeHandoffProps {
  /** The concierge account (`WarmupAccount`) attached to the organization. */
  conciergeId: string;
  /** The lead's first name or the owner's name, for "Invite {name}". */
  ownerName?: string;
  /** Called with every fresh copy of the account, so the list can follow it. */
  onAccountChange?: (account: IWarmupAccount) => void;
}

export interface ConciergePreparationProps {
  account: IWarmupAccount;
  onUpdated: (account: IWarmupAccount) => void;
}

export interface ConciergeStageBadgeProps {
  status: IWarmupAccountStatus;
}

export interface ProvisionConciergeDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called with the new account once it is provisioned (or failed). */
  onProvisioned: (account: IWarmupAccount) => void;
}

export interface ConciergeFormState extends IWarmupAccountCreateRequest {
  guidance: string;
  leadFirstName: string;
  leadLastName: string;
  websiteUrl: string;
}
