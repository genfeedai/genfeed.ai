import { voiceAttributes } from '@serializers/attributes/elements/voice.attributes';
import { simpleConfig } from '@serializers/builders';

export const voiceSerializerConfig = simpleConfig('voice', voiceAttributes);
