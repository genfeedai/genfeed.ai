import { buildSingleSerializer, type BuiltSerializer } from '../../builders';
import { tagSerializerConfig } from '../../configs';

export const TagSerializer: BuiltSerializer = buildSingleSerializer('server', tagSerializerConfig);
