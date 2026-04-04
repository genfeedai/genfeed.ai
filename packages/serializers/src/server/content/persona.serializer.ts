import { buildSerializer } from '@serializers/builders';
import { personaSerializerConfig } from '@serializers/configs';

export const { PersonaSerializer } = buildSerializer(
  'server',
  personaSerializerConfig,
);
