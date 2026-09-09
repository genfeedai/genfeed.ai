import { buildSerializer } from '@serializers/builders';
import { emailPerformanceSerializerConfig } from '@serializers/configs';

export const { EmailPerformanceSerializer } = buildSerializer(
  'server',
  emailPerformanceSerializerConfig,
);
