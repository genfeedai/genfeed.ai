export type IntegrationsState = {
  expandedProvider: string | null;
  apiKeyInputs: Record<string, string>;
  apiSecretInputs: Record<string, string>;
  savingProvider: string | null;
  validatingProvider: string | null;
  removingProvider: string | null;
};

export type IntegrationsAction =
  | { type: 'SET_EXPANDED_PROVIDER'; payload: string | null }
  | { type: 'SET_API_KEY_INPUT'; payload: { provider: string; value: string } }
  | {
      type: 'SET_API_SECRET_INPUT';
      payload: { provider: string; value: string };
    }
  | { type: 'SET_SAVING_PROVIDER'; payload: string | null }
  | { type: 'SET_VALIDATING_PROVIDER'; payload: string | null }
  | { type: 'SET_REMOVING_PROVIDER'; payload: string | null }
  | { type: 'SAVE_SUCCESS'; payload: { provider: string } }
  | { type: 'SAVE_DONE' };
