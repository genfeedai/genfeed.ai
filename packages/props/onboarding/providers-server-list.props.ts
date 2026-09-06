export interface ProviderRow {
  description: string;
  enabled: boolean;
  key: string;
}

export interface ProvidersServerListProps {
  providerRows: ProviderRow[];
}
