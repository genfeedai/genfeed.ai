import { buildSerializer } from '@serializers/builders';
import { serviceSerializerConfig } from '@serializers/configs';

export const { ServiceSerializer } = buildSerializer(
  'server',
  serviceSerializerConfig,
);
