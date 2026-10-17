import type { ReleaseItemId } from '@genfeedai/contracts/constants';

export interface OrganizationReleaseGrantsProps {
  isReleasePreviewEnabled: boolean;
  releasedItemIds: readonly ReleaseItemId[];
  onChange: (releasedItemIds: ReleaseItemId[]) => Promise<void>;
}
