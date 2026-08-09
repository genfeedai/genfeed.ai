import { buildSerializer } from '@serializers/builders';
import { beehiivSubscriberOutcomeSerializerConfig } from '@serializers/configs';

export const { BeehiivSubscriberOutcomeSerializer } = buildSerializer(
  'server',
  beehiivSubscriberOutcomeSerializerConfig,
);
