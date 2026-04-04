import { buildSerializer } from '@serializers/builders';
import { leadActivitySerializerConfig } from '@serializers/configs';

export const { LeadActivitySerializer } = buildSerializer(
  'server',
  leadActivitySerializerConfig,
);
