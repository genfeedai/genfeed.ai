import { type BuiltSerializer, buildSingleSerializer } from '../../builders';
import { assetSerializerConfig } from '../../configs';

export const AssetSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  assetSerializerConfig,
);
