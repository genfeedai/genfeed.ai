import { buildSerializer } from '@serializers/builders';
import { fanvueSubscriberSerializerConfig } from '@serializers/configs';

export const { FanvueSubscriberSerializer } = buildSerializer(
  'server',
  fanvueSubscriberSerializerConfig,
);
