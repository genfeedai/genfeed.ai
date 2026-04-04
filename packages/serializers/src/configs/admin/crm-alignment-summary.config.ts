import { crmAlignmentSummaryAttributes } from '@serializers/attributes/admin/crm-alignment-summary.attributes';
import { simpleConfig } from '@serializers/builders';

export const crmAlignmentSummarySerializerConfig = simpleConfig(
  'crm-alignment-summary',
  crmAlignmentSummaryAttributes,
);
