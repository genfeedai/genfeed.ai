import { createEntityAttributes } from '@genfeedai/helpers';

export const crmAlignmentSummaryAttributes = createEntityAttributes([
  'completeLeads',
  'completenessPercentage',
  'leadsMissingRequired',
  'openIssues',
  'staleRules',
  'totalLeads',
]);
