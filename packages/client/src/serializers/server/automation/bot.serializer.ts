import { buildSingleSerializer, type BuiltSerializer } from '../../builders';
import { botSerializerConfig } from '../../configs';

export const BotSerializer: BuiltSerializer = buildSingleSerializer('server', botSerializerConfig);
