import { buildSerializer } from '@serializers/builders';
import { leadSerializerConfig } from '@serializers/configs';

export const { LeadSerializer } = buildSerializer(
  'server',
  leadSerializerConfig,
);
