import {
  heygenAvatarAttributes,
  heygenServiceAttributes,
  heygenVoiceAttributes,
} from '../../attributes/integrations/heygen.attributes';
import { simpleConfig } from '../../builders';

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
