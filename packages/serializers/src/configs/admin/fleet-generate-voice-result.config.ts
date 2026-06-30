import { fleetGenerateVoiceResultAttributes } from '@serializers/attributes/admin/fleet-generate-voice-result.attributes';
import { simpleConfig } from '@serializers/builders';

export const fleetGenerateVoiceResultSerializerConfig = simpleConfig(
  'fleet-generate-voice-result',
  fleetGenerateVoiceResultAttributes,
);
