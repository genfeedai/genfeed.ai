import { buildSerializer } from '@serializers/builders';
import { channelTargetSerializerConfig } from '@serializers/configs';

export const { ChannelTargetSerializer } = buildSerializer(
  'server',
  channelTargetSerializerConfig,
);
