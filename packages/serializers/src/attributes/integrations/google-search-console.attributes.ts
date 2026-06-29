import { createEntityAttributes } from '@genfeedai/helpers';

export const googleSearchConsoleSiteAttributes = createEntityAttributes([
  'siteUrl',
  'permissionLevel',
]);

export const googleSearchConsoleSearchAnalyticsAttributes =
  createEntityAttributes([
    'siteUrl',
    'startDate',
    'endDate',
    'dimensions',
    'rows',
    'responseAggregationType',
  ]);
