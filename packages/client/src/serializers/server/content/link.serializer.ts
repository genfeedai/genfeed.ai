import { buildSingleSerializer, type BuiltSerializer } from '../../builders';
import { linkSerializerConfig } from '../../configs';

export const LinkSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  linkSerializerConfig,
);
