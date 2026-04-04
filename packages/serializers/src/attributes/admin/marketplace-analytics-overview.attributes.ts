import { createEntityAttributes } from '@genfeedai/helpers';

export const marketplaceAnalyticsOverviewAttributes = createEntityAttributes([
  'completedOrders',
  'failedOrders',
  'pendingOrders',
  'recentSales',
  'totalPlatformFees',
  'totalRevenue',
  'totalSales',
  'totalSellerEarnings',
]);
