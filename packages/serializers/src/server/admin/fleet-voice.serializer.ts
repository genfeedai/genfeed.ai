import { buildSerializer } from '@serializers/builders';
import { fleetVoiceSerializerConfig } from '@serializers/configs';

export const { FleetVoiceSerializer } = buildSerializer(
  'server',
  fleetVoiceSerializerConfig,
);
