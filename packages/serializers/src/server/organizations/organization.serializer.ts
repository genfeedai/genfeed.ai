import { buildSerializer } from '@serializers/builders';
import { organizationSerializerConfig } from '@serializers/configs';

export const { OrganizationSerializer } = buildSerializer(
  'server',
  organizationSerializerConfig,
);
