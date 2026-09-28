import { buildSerializer } from '@serializers/builders';
import { studioGenerateDraftSerializerConfig } from '@serializers/configs';

export const { StudioGenerateDraftSerializer } = buildSerializer(
  'server',
  studioGenerateDraftSerializerConfig,
);
