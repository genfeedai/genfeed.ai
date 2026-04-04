import { buildSerializer } from '@serializers/builders';
import { assetSerializerConfig } from '@serializers/configs';

export const { AssetSerializer } = buildSerializer(
  'server',
  assetSerializerConfig,
);
