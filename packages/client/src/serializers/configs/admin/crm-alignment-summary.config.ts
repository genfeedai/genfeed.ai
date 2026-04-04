import { crmAlignmentSummaryAttributes } from '../../attributes/admin/crm-alignment-summary.attributes';
import { simpleConfig } from '../../builders';

export const crmAlignmentSummarySerializerConfig = simpleConfig(
  'crm-alignment-summary',
  crmAlignmentSummaryAttributes,
);
