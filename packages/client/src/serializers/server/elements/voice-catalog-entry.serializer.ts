import { type BuiltSerializer, buildSingleSerializer } from '../../builders';
import { voiceCatalogEntrySerializerConfig } from '../../configs';

export const VoiceCatalogEntrySerializer: BuiltSerializer =
  buildSingleSerializer('server', voiceCatalogEntrySerializerConfig);
