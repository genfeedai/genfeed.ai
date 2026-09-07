import type { ITrendPlaybook } from '@genfeedai/contracts/interfaces';
import type { ComponentType } from 'react';

export type PlatformConfigEntry = {
  icon?: ComponentType<{ className?: string }>;
  label?: string;
};

export type Props = {
  playbooks: ITrendPlaybook[];
  platformConfigLookup: Record<string, PlatformConfigEntry>;
};
