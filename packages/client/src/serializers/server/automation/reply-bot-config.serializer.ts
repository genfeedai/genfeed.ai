import { type BuiltSerializer, buildSingleSerializer } from '../../builders';
import { replyBotConfigSerializerConfig } from '../../configs';

export const ReplyBotConfigSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  replyBotConfigSerializerConfig,
);
