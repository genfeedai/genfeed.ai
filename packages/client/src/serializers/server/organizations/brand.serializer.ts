import { type BuiltSerializer, buildSingleSerializer } from '../../builders';
import { brandSerializerConfig } from '../../configs';

export const BrandSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  brandSerializerConfig,
);
