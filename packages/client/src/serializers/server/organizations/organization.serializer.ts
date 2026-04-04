import { buildSingleSerializer, type BuiltSerializer } from '../../builders';
import { organizationSerializerConfig } from '../../configs';

export const OrganizationSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  organizationSerializerConfig,
);
