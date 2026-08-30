import { buildSerializer } from '@serializers/builders';
import { referralProgramSerializerConfig } from '@serializers/configs';

export const { ReferralProgramSerializer } = buildSerializer(
  'server',
  referralProgramSerializerConfig,
);
