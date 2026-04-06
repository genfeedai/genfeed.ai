import { type BuiltSerializer, buildSingleSerializer } from '../../builders';
import { organizationSerializerConfig } from '../../configs';

export const OrganizationSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  organizationSerializerConfig,
);
