import { buildSingleSerializer, type BuiltSerializer } from '../../builders';
import { runSerializerConfig } from '../../configs';

export const RunSerializer: BuiltSerializer = buildSingleSerializer('server', runSerializerConfig);
