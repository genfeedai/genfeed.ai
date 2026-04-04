import { buildSingleSerializer, type BuiltSerializer } from '../../builders';
import { campaignSerializerConfig } from '../../configs';

export const CampaignSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  campaignSerializerConfig,
);
