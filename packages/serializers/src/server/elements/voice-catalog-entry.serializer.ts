import { buildSerializer } from '@serializers/builders';
import { voiceCatalogEntrySerializerConfig } from '@serializers/configs';

export const { VoiceCatalogEntrySerializer } = buildSerializer(
  'server',
  voiceCatalogEntrySerializerConfig,
);
