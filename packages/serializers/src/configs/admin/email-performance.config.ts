import { emailPerformanceAttributes } from '@serializers/attributes/admin/email-performance.attributes';
import { simpleConfig } from '@serializers/builders';

export const emailPerformanceSerializerConfig = simpleConfig(
  'email-performance',
  emailPerformanceAttributes,
);
