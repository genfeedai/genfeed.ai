export interface SubscriptionPreviewPrice {
  id: string;
  unit_amount: number | null;
}

export interface SubscriptionChangePreview {
  currentPrice?: SubscriptionPreviewPrice;
  newPriceId: string;
  prorationAmount: number;
  isUpgrade: boolean;
  isDowngrade: boolean;
  upcomingInvoice: {
    amount_due: number;
    currency: string;
    lines: Array<{
      amount: number;
      description?: string | null;
    }>;
  };
}
