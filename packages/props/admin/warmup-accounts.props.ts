import type {
  IWarmupAccount,
  IWarmupAccountCreateRequest,
} from '@genfeedai/interfaces';

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
