import { buildSerializer } from '@serializers/builders';
import { referralRewardSerializerConfig } from '@serializers/configs';

export const { ReferralRewardSerializer } = buildSerializer(
  'server',
  referralRewardSerializerConfig,
);
