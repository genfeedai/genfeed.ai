import { buildSingleSerializer, type BuiltSerializer } from '../../builders';
import { replyBotConfigSerializerConfig } from '../../configs';

export const ReplyBotConfigSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  replyBotConfigSerializerConfig,
);
