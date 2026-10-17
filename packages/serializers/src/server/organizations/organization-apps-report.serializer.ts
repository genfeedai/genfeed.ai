import { buildSerializer } from '@serializers/builders';
import { organizationAppsReportSerializerConfig } from '@serializers/configs';

export const { OrganizationAppsReportSerializer } = buildSerializer(
  'server',
  organizationAppsReportSerializerConfig,
);
