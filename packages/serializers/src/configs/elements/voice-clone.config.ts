import { voiceCloneAttributes } from '@serializers/attributes/elements/voice-clone.attributes';
import { simpleConfig } from '@serializers/builders';

export const voiceCloneSerializerConfig = simpleConfig(
  'voice-clone',
  voiceCloneAttributes,
);
