import { buildSerializer } from '@serializers/builders';
import { botSerializerConfig } from '@serializers/configs';

export const { BotSerializer } = buildSerializer('server', botSerializerConfig);
