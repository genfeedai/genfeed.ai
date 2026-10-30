import type { ICampaign } from '@genfeedai/contracts/interfaces';

export interface CampaignCreativeContextFieldsProps {
  brandId: string;
  value: Pick<
    ICampaign,
    'audience' | 'tone' | 'creativeDirection' | 'assetIds'
  >;
  onChange: (
    patch: Pick<
      ICampaign,
      'audience' | 'tone' | 'creativeDirection' | 'assetIds'
    >,
  ) => void;
}

export interface CampaignFormPageProps {
  campaignId?: string;
}
