import { buildSingleSerializer, type BuiltSerializer } from '../../builders';
import {
  heygenAvatarSerializerConfig,
  heygenServiceSerializerConfig,
  heygenVoiceSerializerConfig,
} from '../../configs';

export const HeyGenAvatarSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  heygenAvatarSerializerConfig,
);

export const HeyGenServiceSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  heygenServiceSerializerConfig,
);

export const HeyGenVoiceSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  heygenVoiceSerializerConfig,
);
