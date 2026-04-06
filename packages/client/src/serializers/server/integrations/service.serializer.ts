import { type BuiltSerializer, buildSingleSerializer } from '../../builders';
import { serviceSerializerConfig } from '../../configs';

export const ServiceSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  serviceSerializerConfig,
);
