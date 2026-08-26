import { createEntityAttributes } from '@genfeedai/helpers';

export const costReportEntryAttributes = createEntityAttributes([
  'entryType',
  'brandId',
  'brandLabel',
  'provider',
  'model',
  'category',
  'referenceId',
  'providerCostMicros',
  'providerCostUsd',
  'creditsUsed',
  'isByok',
  'createdAt',
]);
