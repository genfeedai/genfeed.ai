import { buildSingleSerializer, type BuiltSerializer } from '../../builders';
import { serviceSerializerConfig } from '../../configs';

export const ServiceSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  serviceSerializerConfig,
);
