import { beehiivSubscriberOutcomeAttributes } from '@serializers/attributes/integrations/beehiiv-subscriber-outcome.attributes';
import { simpleConfig } from '@serializers/builders';

export const beehiivSubscriberOutcomeSerializerConfig = simpleConfig(
  'beehiiv-subscriber-outcome',
  beehiivSubscriberOutcomeAttributes,
);
