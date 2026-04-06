import { type BuiltSerializer, buildSingleSerializer } from '../../builders';
import { linkSerializerConfig } from '../../configs';

export const LinkSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  linkSerializerConfig,
);
