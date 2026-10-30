import type { IByokProviderStatus } from '@genfeedai/contracts/interfaces';

export type IntegrationsState = {
  providerStatuses: IByokProviderStatus[];
  expandedProvider: string | null;
  apiKeyInputs: Record<string, string>;
  apiSecretInputs: Record<string, string>;
  savingProvider: string | null;
  validatingProvider: string | null;
  removingProvider: string | null;
  isLoading: boolean;
};

export type IntegrationsAction =
  | { type: 'SET_PROVIDER_STATUSES'; payload: IByokProviderStatus[] }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_EXPANDED_PROVIDER'; payload: string | null }
  | { type: 'SET_API_KEY_INPUT'; payload: { provider: string; value: string } }
  | {
      type: 'SET_API_SECRET_INPUT';
      payload: { provider: string; value: string };
    }
  | { type: 'SET_SAVING_PROVIDER'; payload: string | null }
  | { type: 'SET_VALIDATING_PROVIDER'; payload: string | null }
  | { type: 'SET_REMOVING_PROVIDER'; payload: string | null }
  | {
      type: 'SAVE_SUCCESS';
      payload: {
        provider: string;
        statuses: IByokProviderStatus[];
      };
    }
  | { type: 'SAVE_DONE' };
