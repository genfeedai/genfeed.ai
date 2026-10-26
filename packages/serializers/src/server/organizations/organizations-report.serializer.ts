import { buildSerializer } from '@serializers/builders';
import { organizationsReportSerializerConfig } from '@serializers/configs';

export const { OrganizationsReportSerializer } = buildSerializer(
  'server',
  organizationsReportSerializerConfig,
);
