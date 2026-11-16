import { buildSerializer } from '@serializers/builders';
import { waitlistEntrySerializerConfig } from '@serializers/configs';

export const { WaitlistEntrySerializer } = buildSerializer(
  'server',
  waitlistEntrySerializerConfig,
);
