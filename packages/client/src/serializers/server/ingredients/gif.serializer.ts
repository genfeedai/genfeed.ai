import { buildSingleSerializer, type BuiltSerializer } from '../../builders';
import { gifSerializerConfig } from '../../configs';

export const GifSerializer: BuiltSerializer = buildSingleSerializer('server', gifSerializerConfig);
