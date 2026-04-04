import { buildSerializer } from '@serializers/builders';
import { fontFamilySerializerConfig } from '@serializers/configs';

export const { FontFamilySerializer } = buildSerializer(
  'server',
  fontFamilySerializerConfig,
);
