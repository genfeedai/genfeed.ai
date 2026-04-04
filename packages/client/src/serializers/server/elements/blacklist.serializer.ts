import { buildSingleSerializer, type BuiltSerializer } from '../../builders';
import { elementBlacklistSerializerConfig } from '../../configs';

export const ElementBlacklistSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  elementBlacklistSerializerConfig,
);

export { ElementBlacklistSerializer as BlacklistSerializer };
