import { buildSingleSerializer, type BuiltSerializer } from '../../builders';
import { brandSerializerConfig } from '../../configs';

export const BrandSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  brandSerializerConfig,
);
