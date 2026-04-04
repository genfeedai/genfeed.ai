import { botAttributes } from '@serializers/attributes/automation/bot.attributes';
import { simpleConfig } from '@serializers/builders';

export const botSerializerConfig = simpleConfig('bot', botAttributes);
