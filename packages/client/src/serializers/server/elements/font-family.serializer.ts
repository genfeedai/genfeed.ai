import { buildSingleSerializer, type BuiltSerializer } from '../../builders';
import { fontFamilySerializerConfig } from '../../configs';

export const FontFamilySerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  fontFamilySerializerConfig,
);
