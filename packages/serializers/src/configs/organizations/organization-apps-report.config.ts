import { organizationAppsReportAttributes } from '@serializers/attributes/organizations/organization-apps-report.attributes';
import { simpleConfig } from '@serializers/builders';

export const organizationAppsReportSerializerConfig = simpleConfig(
  'organization-apps-report',
  organizationAppsReportAttributes,
);
