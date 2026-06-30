import { buildSerializer } from '@serializers/builders';
import { fleetGenerateVoiceResultSerializerConfig } from '@serializers/configs';

export const { FleetGenerateVoiceResultSerializer } = buildSerializer(
  'server',
  fleetGenerateVoiceResultSerializerConfig,
);
