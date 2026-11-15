import type {
  OrganizationModuleOverrides,
  ReleaseItemId,
} from '@genfeedai/contracts/constants';

interface OrganizationAppAccessChange {
  moduleOverrides?: OrganizationModuleOverrides;
  releasedItemIds?: ReleaseItemId[];
}

export interface OrganizationAppAccessProps {
  hasOrganizationBilling: boolean;
  isReleasePreviewEnabled: boolean;
  moduleOverrides: OrganizationModuleOverrides;
  releasedItemIds: readonly ReleaseItemId[];
  onChange: (change: OrganizationAppAccessChange) => Promise<void>;
}

type OrganizationAppAccessGroup = 'apps' | 'analyticsPages';

export interface OrganizationAppAccessRow {
  description: string | null;
  group: OrganizationAppAccessGroup;
  id: string;
  isLocked: boolean;
  isOn: boolean;
  label: string;
}
