import {
  type BuiltSerializer,
  botActivitySerializerConfig,
  botSerializerConfig,
  buildSingleSerializer,
  monitoredAccountSerializerConfig,
  replyBotConfigSerializerConfig,
  workflowSerializerConfig,
} from '..';

// Build all automation serializers
export const BotSerializer: BuiltSerializer = buildSingleSerializer(
  'client',
  botSerializerConfig,
);
export const BotActivitySerializer: BuiltSerializer = buildSingleSerializer(
  'client',
  botActivitySerializerConfig,
);
export const MonitoredAccountSerializer: BuiltSerializer =
  buildSingleSerializer('client', monitoredAccountSerializerConfig);
export const ReplyBotConfigSerializer: BuiltSerializer = buildSingleSerializer(
  'client',
  replyBotConfigSerializerConfig,
);
export const WorkflowSerializer: BuiltSerializer = buildSingleSerializer(
  'client',
  workflowSerializerConfig,
);
