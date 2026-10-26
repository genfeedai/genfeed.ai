import { organizationsReportAttributes } from '@serializers/attributes/organizations/organizations-report.attributes';
import { simpleConfig } from '@serializers/builders';

export const organizationsReportSerializerConfig = simpleConfig(
  'organizations-report',
  organizationsReportAttributes,
);
