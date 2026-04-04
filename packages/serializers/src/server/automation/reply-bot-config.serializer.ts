import { buildSerializer } from '@serializers/builders';
import { replyBotConfigSerializerConfig } from '@serializers/configs';

export const { ReplyBotConfigSerializer } = buildSerializer(
  'server',
  replyBotConfigSerializerConfig,
);
