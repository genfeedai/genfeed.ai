import { buildSingleSerializer, type BuiltSerializer } from '../../builders';
import { personaSerializerConfig } from '../../configs';

export const PersonaSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  personaSerializerConfig,
);
