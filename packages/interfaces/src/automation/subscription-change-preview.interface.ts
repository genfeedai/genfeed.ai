export interface SubscriptionChangePreview {
  currentPrice?: number;
  newPriceId: string;
  prorationAmount: number;
  isUpgrade: boolean;
  isDowngrade: boolean;
  upcomingInvoice: {
    amount_due: number;
    currency: string;
    lines: Array<{
      amount: number;
      description?: string;
      [key: string]: unknown;
    }>;
  };
}
