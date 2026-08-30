import { buildSerializer } from '@serializers/builders';
import { referralAdminRewardSerializerConfig } from '@serializers/configs';

export const { ReferralAdminRewardSerializer } = buildSerializer(
  'server',
  referralAdminRewardSerializerConfig,
);
