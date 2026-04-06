import { type BuiltSerializer, buildSingleSerializer } from '../../builders';
import { personaSerializerConfig } from '../../configs';

export const PersonaSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  personaSerializerConfig,
);
