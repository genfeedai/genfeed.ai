import { type BuiltSerializer, buildSingleSerializer } from '../../builders';
import { metadataSerializerConfig } from '../../configs';

export const MetadataSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  metadataSerializerConfig,
);
