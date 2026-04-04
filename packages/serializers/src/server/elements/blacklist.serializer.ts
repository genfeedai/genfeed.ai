import { buildSerializer } from '@serializers/builders';
import { elementBlacklistSerializerConfig } from '@serializers/configs';

export const { ElementBlacklistSerializer } = buildSerializer(
  'server',
  elementBlacklistSerializerConfig,
);

export { ElementBlacklistSerializer as BlacklistSerializer };
