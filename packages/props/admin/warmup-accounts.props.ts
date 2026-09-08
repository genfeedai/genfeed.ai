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

export interface WarmupAccountsPageState {
  accounts: IWarmupAccount[];
  activeTab: 'accounts' | 'create';
  form: WarmupAccountFormState;
  invitationAction: WarmupPendingInvitationAction | null;
  isLoading: boolean;
  isSubmitting: boolean;
  loadTrigger: number;
  loadError?: string;
  selectedAccountId?: string;
}

export interface WarmupPendingInvitationAction {
  accountId: string;
  action: WarmupInvitationAction;
  requestId: number;
}

export type WarmupActiveInvitationRequest = WarmupPendingInvitationAction & {
  controller: AbortController;
};

export type WarmupAccountsPageAction =
  | { type: 'SET_TAB'; tab: 'accounts' | 'create' }
  | { type: 'SET_LOADING'; isLoading: boolean }
  | { type: 'SET_LOAD_ERROR'; message: string }
  | { type: 'SET_SUBMITTING'; isSubmitting: boolean }
  | { type: 'SET_ACCOUNTS'; accounts: IWarmupAccount[] }
  | {
      type: 'SET_FIELD';
      field: keyof WarmupAccountFormState;
      value: string;
    }
  | { type: 'SET_SELECTED'; accountId: string }
  | { type: 'SET_INVITATION_ACTION'; request: WarmupPendingInvitationAction }
  | { type: 'CLEAR_INVITATION_ACTION'; requestId: number }
  | { type: 'UPSERT_ACCOUNT'; account: IWarmupAccount }
  | { type: 'CREATE_SUCCESS'; account: IWarmupAccount };

export interface WarmupPreparationPanelProps {
  account: IWarmupAccount;
  onUpdated: (account: IWarmupAccount) => void;
}
