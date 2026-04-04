import { buildSingleSerializer, type BuiltSerializer } from '../../builders';
import { assetSerializerConfig } from '../../configs';

export const AssetSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  assetSerializerConfig,
);
