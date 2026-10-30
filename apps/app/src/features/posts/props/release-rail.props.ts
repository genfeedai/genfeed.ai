import type { IReleaseGroup } from '@genfeedai/contracts/interfaces';
export interface ReleaseRailAccountsProps {
  brandId?: string | null;
  onToggle: (credentialId: string) => void;
  selectedCredentialIds: string[];
}

export interface ReleaseRailRowProps {
  browserTimezone: string;
  index?: number;
  isActive: boolean;
  onActivate: () => void;
  release: IReleaseGroup;
  registerRow?: (element: HTMLElement | null) => void;
}

export type ReleaseRailTargetTone =
  | 'destructive'
  | 'info'
  | 'secondary'
  | 'success'
  | 'warning';

export interface ReleaseRailOutcomeSummary {
  failed: number;
  pending: number;
  published: number;
}
