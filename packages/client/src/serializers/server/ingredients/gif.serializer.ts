import { type BuiltSerializer, buildSingleSerializer } from '../../builders';
import { gifSerializerConfig } from '../../configs';

export const GifSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  gifSerializerConfig,
);
