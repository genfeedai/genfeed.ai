import type {
  IWarmupAccount,
  IWarmupAccountCreateRequest,
} from '@genfeedai/contracts/interfaces';

export interface WarmupAccountFormState extends IWarmupAccountCreateRequest {
  guidance: string;
  leadFirstName: string;
  leadLastName: string;
  websiteUrl: string;
}

export interface WarmupAccountsPageProps {
  defaultTab?: 'create' | 'accounts';
}

export interface WarmupAccountListProps {
  accounts: IWarmupAccount[];
  isLoading: boolean;
  selectedAccountId?: string;
  onSelectAccount: (accountId: string) => void;
}

export type WarmupInvitationAction = 'inspect' | 'resend' | 'revoke' | 'send';

export interface WarmupAccountDetailProps {
  account?: IWarmupAccount;
  invitationAction?: WarmupInvitationAction | null;
  onInspect: () => void;
  onResend: () => void;
  onRevoke: () => void;
  onSend: () => void;
}
