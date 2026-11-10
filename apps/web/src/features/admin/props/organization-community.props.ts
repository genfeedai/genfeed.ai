import type { IAdminCommunityMedia } from '@genfeedai/contracts/interfaces';
import type { AdminCommunityTarget } from '@services/admin/community.service';

export interface OrganizationCommunityProps {
  organizationId: string;
}

/** One operator write on genfeed.ai/community. */
export type OrganizationCommunityAction =
  | {
      id: string;
      isFeatured: boolean;
      kind: 'feature';
      target: AdminCommunityTarget;
    }
  | { id: string; kind: 'unpublish'; target: AdminCommunityTarget };

export interface OrganizationCommunityMediaPreviewProps {
  media: IAdminCommunityMedia;
}
