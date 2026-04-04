import { buildSerializer } from '@serializers/builders';
import { soundSerializerConfig } from '@serializers/configs';

export const { SoundSerializer } = buildSerializer(
  'server',
  soundSerializerConfig,
);
