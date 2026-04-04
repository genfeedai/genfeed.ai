import { buildSingleSerializer, type BuiltSerializer } from '../../builders';
import { fanvueSubscriberSerializerConfig } from '../../configs';

export const FanvueSubscriberSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  fanvueSubscriberSerializerConfig,
);
