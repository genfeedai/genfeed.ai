import { buildSerializer } from '@serializers/builders';
import {
  heygenAvatarSerializerConfig,
  heygenServiceSerializerConfig,
  heygenVoiceSerializerConfig,
} from '@serializers/configs';

export const { HeyGenAvatarSerializer } = buildSerializer(
  'server',
  heygenAvatarSerializerConfig,
);

export const { HeyGenServiceSerializer } = buildSerializer(
  'server',
  heygenServiceSerializerConfig,
);

export const { HeyGenVoiceSerializer } = buildSerializer(
  'server',
  heygenVoiceSerializerConfig,
);
