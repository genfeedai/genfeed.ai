import { warmupAccountAttributes } from '@serializers/attributes/admin/warmup-account.attributes';
import { simpleConfig } from '@serializers/builders';

export const warmupAccountSerializerConfig = simpleConfig(
  'warmup-account',
  warmupAccountAttributes,
);
