import type { Campaign } from '@services/content/campaigns.service';

export interface CampaignCreateDialogProps {
  onClose: () => void;
}
export interface CampaignsListPageProps {
  isCreateOpen?: boolean;
}
export interface CampaignGenerateDialogProps {
  campaign: Campaign;
  onClose: () => void;
}
export interface CampaignAccountsProps {
  brandId: string;
}
