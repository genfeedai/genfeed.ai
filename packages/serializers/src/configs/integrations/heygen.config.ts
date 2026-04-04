import {
  heygenAvatarAttributes,
  heygenServiceAttributes,
  heygenVoiceAttributes,
} from '@serializers/attributes/integrations/heygen.attributes';
import { simpleConfig } from '@serializers/builders';

export const heygenServiceSerializerConfig = simpleConfig(
  'hey-gen-service',
  heygenServiceAttributes,
);

export const heygenVoiceSerializerConfig = simpleConfig(
  'hey-gen-voice',
  heygenVoiceAttributes,
);

export const heygenAvatarSerializerConfig = simpleConfig(
  'hey-gen-avatar',
  heygenAvatarAttributes,
);
