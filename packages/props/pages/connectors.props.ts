import type { ComponentType } from 'react';

export type ConnectorsSection =
  | 'agents'
  | 'api-keys'
  | 'channels'
  | 'providers'
  | 'webhooks';

export interface ConnectorsSectionConfig {
  icon: ComponentType<{ className?: string }>;
  /** Key under `pages.connectors.sections`. */
  labelKey: 'agents' | 'apiKeys' | 'channels' | 'providers' | 'webhooks';
  path: string;
  section: ConnectorsSection;
}

export interface ConnectorsPrimaryAction {
  label: string;
  onClick: () => void;
}

export interface ConnectorsPrimaryActionContextValue {
  setPrimaryAction: (action: ConnectorsPrimaryAction | null) => void;
}
