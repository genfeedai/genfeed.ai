import type { ITrendPlaybook } from '@genfeedai/contracts/interfaces';
import type { IconComponent } from '@genfeedai/contracts/types/icon';

export type PlatformConfigEntry = {
  icon?: IconComponent;
  label?: string;
};

export type Props = {
  playbooks: ITrendPlaybook[];
  platformConfigLookup: Record<string, PlatformConfigEntry>;
};
