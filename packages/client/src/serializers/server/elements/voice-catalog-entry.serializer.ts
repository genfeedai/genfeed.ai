import { buildSingleSerializer, type BuiltSerializer } from '../../builders';
import { voiceCatalogEntrySerializerConfig } from '../../configs';

export const VoiceCatalogEntrySerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  voiceCatalogEntrySerializerConfig,
);
