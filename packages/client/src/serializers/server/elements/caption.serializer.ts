import { type BuiltSerializer, buildSingleSerializer } from '../../builders';
import { captionSerializerConfig } from '../../configs';

export const CaptionSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  captionSerializerConfig,
);
