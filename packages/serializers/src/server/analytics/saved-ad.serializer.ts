import { buildSerializer } from '@serializers/builders';
import { savedAdSerializerConfig } from '@serializers/configs';

export const { SavedAdSerializer } = buildSerializer(
  'server',
  savedAdSerializerConfig,
);
