import type {
  OrganizationModuleOverrides,
  ReleaseItemId,
} from '@genfeedai/contracts/constants';

export interface OrganizationReleaseGrantsProps {
  hasOrganizationBilling: boolean;
  isReleasePreviewEnabled: boolean;
  moduleOverrides: OrganizationModuleOverrides;
  releasedItemIds: readonly ReleaseItemId[];
  onModuleOverridesChange: (
    moduleOverrides: OrganizationModuleOverrides,
  ) => Promise<void>;
  onReleasedItemIdsChange: (releasedItemIds: ReleaseItemId[]) => Promise<void>;
}
