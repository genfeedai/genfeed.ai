import { fleetVoiceAttributes } from '@serializers/attributes/admin/fleet-voice.attributes';
import { simpleConfig } from '@serializers/builders';

export const fleetVoiceSerializerConfig = simpleConfig(
  'fleet-voice',
  fleetVoiceAttributes,
);
