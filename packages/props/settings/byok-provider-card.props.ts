import type { IByokProviderStatus } from '@genfeedai/contracts/interfaces';

export type ByokProviderCardState = {
  isExpanded: boolean;
  isRemoving: boolean;
  isValidating: boolean;
  isSaving: boolean;
};

export type Props = {
  providerStatus: IByokProviderStatus;
  cardState: ByokProviderCardState;
  apiKeyValue: string;
  apiSecretValue: string;
  onToggleExpand: () => void;
  onApiKeyChange: (value: string) => void;
  onApiSecretChange: (value: string) => void;
  onValidateAndSave: () => void;
  onRemoveKey: () => void;
};
