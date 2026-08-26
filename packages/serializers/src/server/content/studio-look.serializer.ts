import { buildSerializer } from '@serializers/builders';
import { studioLookSerializerConfig } from '@serializers/configs';

export const { StudioLookSerializer } = buildSerializer(
  'server',
  studioLookSerializerConfig,
);
