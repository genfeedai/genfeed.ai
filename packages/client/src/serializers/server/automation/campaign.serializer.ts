import { type BuiltSerializer, buildSingleSerializer } from '../../builders';
import { campaignSerializerConfig } from '../../configs';

export const CampaignSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  campaignSerializerConfig,
);
